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
  return accounts
    .filter((a) => !isLiability(a.kind) && (a.kind === "cash" || a.kind === "savings"))
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
    })),
    committedSavings: dcaMonthly + fixedSavingsTarget,
    bufferAmount: profile?.bufferAmount ?? 0,
  };

  return assembleDashboard(input);
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
