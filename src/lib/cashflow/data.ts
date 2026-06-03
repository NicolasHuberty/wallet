import { db, schema } from "@/db";
import { and, eq, gte } from "drizzle-orm";
import { getAccounts, getActiveMortgages, getDcaPlans } from "@/lib/queries";
import { isLiability } from "@/lib/labels";
import {
  assembleDashboard,
  type AssembleInput,
  type CashflowDashboard,
  type FixedExpenseRow,
  type IncomeRow,
} from "./assemble";
import { computeRollover, type RolloverResult } from "./rollover";

/**
 * Cash-flow ("Cap") — couche données serveur. Fetch les rows du household et
 * délègue tout le calcul à `assembleDashboard` (pur, testé). Ne persiste rien :
 * le dashboard est lisible même sans cycle ouvert (ouverture explicite via une
 * action plus tard).
 */

/** Mensualise un montant DCA selon sa fréquence. */
function monthlyizeDca(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "biweekly":
      return (amount * 26) / 12;
    case "quarterly":
      return amount / 3;
    case "monthly":
    default:
      return amount;
  }
}

export async function getFinancialProfile(householdId: string) {
  const rows = await db
    .select()
    .from(schema.financialProfile)
    .where(eq(schema.financialProfile.householdId, householdId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBudgetEnvelopes(householdId: string) {
  return db
    .select()
    .from(schema.budgetEnvelope)
    .where(eq(schema.budgetEnvelope.householdId, householdId));
}

/** Charges fixes datées du household (pour l'échéancier). */
export async function getFixedCharges(householdId: string) {
  const rows = await db
    .select()
    .from(schema.recurringExpense)
    .where(eq(schema.recurringExpense.householdId, householdId));
  return rows.filter((r) => r.flowType === "fixed");
}

/** Dépenses confirmées depuis le début du mois courant. */
export async function getSpendEventsThisMonth(householdId: string, today: Date) {
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return db
    .select()
    .from(schema.spendEvent)
    .where(
      and(
        eq(schema.spendEvent.householdId, householdId),
        gte(schema.spendEvent.date, monthStart),
      ),
    );
}

/** Solde de vie courante : compte dédié si défini, sinon cash + épargne. */
function resolveBalance(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  spendingAccountId: string | null | undefined,
): number {
  if (spendingAccountId) {
    const acc = accounts.find((a) => a.id === spendingAccountId);
    if (acc) return acc.currentValue;
  }
  // Par défaut, on ne compte QUE les comptes courants (cash) — l'épargne ne
  // doit pas être considérée comme dépensable. Repli sur cash+épargne seulement
  // s'il n'existe aucun compte courant.
  const cash = accounts.filter((a) => !isLiability(a.kind) && a.kind === "cash");
  if (cash.length > 0) return cash.reduce((s, a) => s + a.currentValue, 0);
  return accounts
    .filter((a) => !isLiability(a.kind) && a.kind === "savings")
    .reduce((s, a) => s + a.currentValue, 0);
}

/**
 * Construit le view-model du dashboard cash-flow pour un household à une date
 * donnée (par défaut maintenant).
 */
export async function getCashflowDashboard(
  householdId: string,
  today: Date = new Date(),
): Promise<CashflowDashboard> {
  const [profile, envelopes, accounts, dcaPlans, mortgages, incomesRaw, expensesRaw, spendEvents] =
    await Promise.all([
      getFinancialProfile(householdId),
      getBudgetEnvelopes(householdId),
      getAccounts(householdId),
      getDcaPlans(householdId),
      getActiveMortgages(householdId),
      db
        .select()
        .from(schema.recurringIncome)
        .where(eq(schema.recurringIncome.householdId, householdId)),
      db
        .select()
        .from(schema.recurringExpense)
        .where(eq(schema.recurringExpense.householdId, householdId)),
      getSpendEventsThisMonth(householdId, today),
    ]);

  const incomes: IncomeRow[] = incomesRaw.map((i) => ({
    label: i.label,
    amount: i.amount,
    dayOfMonth: i.dayOfMonth,
    // Les revenus récurrents sont mensuels dans ce modèle (salaire, allocations).
    frequency: "monthly",
    isVariable: i.isVariable,
    floorAmount: i.floorAmount,
    startDate: i.startDate,
    endDate: i.endDate,
  }));

  const fixedExpenses: FixedExpenseRow[] = expensesRaw.map((e) => ({
    label: e.label,
    amount: e.amount,
    dayOfMonth: e.dayOfMonth,
    frequency: e.frequency,
    flowType: e.flowType,
    active: e.active,
    startDate: e.startDate,
    endDate: e.endDate,
  }));

  // Les mensualités de prêt sont des fixes datés (jour 1 par défaut).
  for (const { mortgage } of mortgages) {
    fixedExpenses.push({
      label: "Prêt hypothécaire",
      amount: mortgage.monthlyPayment,
      dayOfMonth: 1,
      frequency: "monthly",
      flowType: "fixed",
      active: true,
      startDate: mortgage.startDate,
      endDate: null,
    });
  }

  const dcaMonthly = dcaPlans
    .filter((d) => d.active)
    .reduce((s, d) => s + monthlyizeDca(d.amount, d.frequency), 0);
  const fixedSavingsTarget =
    profile?.savingsTargetMode === "fixed" ? profile.savingsTargetAmount ?? 0 : 0;

  const input: AssembleInput = {
    today,
    availableBalance: resolveBalance(accounts, profile?.spendingAccountId),
    incomes,
    fixedExpenses,
    envelopes: envelopes.map((e) => ({
      id: e.id,
      label: e.label,
      category: e.category,
      monthlyAmount: e.monthlyAmount,
      cadence: e.cadence,
      occurrencesPerMonth: e.occurrencesPerMonth,
      active: e.active,
    })),
    spendEvents: spendEvents.map((s) => ({
      amount: s.amount,
      envelopeId: s.envelopeId,
      chargedToBuffer: s.chargedToBuffer,
      date: s.date,
    })),
    committedSavings: dcaMonthly + fixedSavingsTarget,
    bufferAmount: profile?.bufferAmount ?? 0,
  };

  return assembleDashboard(input);
}

export type MonthEnvelopeLine = {
  id: string;
  label: string;
  planned: number;
  consumed: number;
  remaining: number;
};

export type MonthOverview = {
  month: string;
  cycle: typeof schema.monthCycle.$inferSelect | null;
  dashboard: CashflowDashboard;
  envelopeLines: MonthEnvelopeLine[];
  /** Débordement projeté si le mois finissait maintenant. */
  rolloverPreview: RolloverResult;
};

/** Vue « Le mois » : cycle + plan vs réel + aperçu du débordement. */
export async function getMonthOverview(
  householdId: string,
  today: Date = new Date(),
): Promise<MonthOverview> {
  const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const [dashboard, envelopes, spendEvents, cycleRows] = await Promise.all([
    getCashflowDashboard(householdId, today),
    getBudgetEnvelopes(householdId),
    getSpendEventsThisMonth(householdId, today),
    db
      .select()
      .from(schema.monthCycle)
      .where(and(eq(schema.monthCycle.householdId, householdId), eq(schema.monthCycle.month, month)))
      .limit(1),
  ]);

  const consumedByEnvelope = new Map<string, number>();
  for (const s of spendEvents) {
    if (s.chargedToBuffer || s.envelopeId === null) continue;
    consumedByEnvelope.set(
      s.envelopeId,
      (consumedByEnvelope.get(s.envelopeId) ?? 0) + s.amount,
    );
  }

  const activeEnvelopes = envelopes.filter((e) => e.active);
  const envelopeLines: MonthEnvelopeLine[] = activeEnvelopes.map((e) => {
    const consumed = consumedByEnvelope.get(e.id) ?? 0;
    return {
      id: e.id,
      label: e.label,
      planned: e.monthlyAmount,
      consumed,
      remaining: Math.max(0, e.monthlyAmount - consumed),
    };
  });

  const rolloverPreview = computeRollover(
    activeEnvelopes.map((e) => ({
      id: e.id,
      planned: e.monthlyAmount,
      consumed: consumedByEnvelope.get(e.id) ?? 0,
      policy: e.rolloverPolicy,
    })),
  );

  return { month, cycle: cycleRows[0] ?? null, dashboard, envelopeLines, rolloverPreview };
}

/** True si le household a de quoi afficher un dashboard utile. */
export async function hasCashflowSetup(householdId: string): Promise<boolean> {
  const [incomes, envelopes] = await Promise.all([
    db
      .select({ id: schema.recurringIncome.id })
      .from(schema.recurringIncome)
      .where(eq(schema.recurringIncome.householdId, householdId))
      .limit(1),
    db
      .select({ id: schema.budgetEnvelope.id })
      .from(schema.budgetEnvelope)
      .where(eq(schema.budgetEnvelope.householdId, householdId))
      .limit(1),
  ]);
  return incomes.length > 0 || envelopes.length > 0;
}
