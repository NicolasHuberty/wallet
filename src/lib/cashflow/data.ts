import { db, schema } from "@/db";
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import { getAccounts, getActiveMortgages, getDcaPlans } from "@/lib/queries";
import {
  assembleDashboard,
  type AssembleInput,
  type CashflowDashboard,
  type FixedExpenseRow,
  type IncomeRow,
} from "./assemble";
import { deriveSpendEvents } from "./affect";
import { transactionCategory, type TransactionCategory } from "@/lib/transaction-categorizer";
import { computeRollover, type RolloverResult } from "./rollover";

/**
 * Cash-flow ("Cap") — couche données serveur. Fetch les rows du household et
 * délègue tout le calcul à `assembleDashboard` (pur, testé). Ne persiste rien :
 * le dashboard est lisible même sans cycle ouvert (ouverture explicite via une
 * action plus tard).
 */

const TX_CATEGORY_SET = new Set<string>(transactionCategory);

/** Parse le JSON `txCategories` d'une enveloppe → catégories valides (ou null). */
function parseTxCategories(raw: string | null): TransactionCategory[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const valid = v.filter((x): x is TransactionCategory => typeof x === "string" && TX_CATEGORY_SET.has(x));
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

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

/** Sources de revenus récurrents du household. */
export async function getIncomeSources(householdId: string) {
  return db
    .select()
    .from(schema.recurringIncome)
    .where(eq(schema.recurringIncome.householdId, householdId));
}

/** Dépenses confirmées du mois courant (bornées au mois, pour éviter qu'un
 *  événement daté d'un mois futur ne fuite dans la consommation courante). */
export async function getSpendEventsThisMonth(householdId: string, today: Date) {
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  return db
    .select()
    .from(schema.spendEvent)
    .where(
      and(
        eq(schema.spendEvent.householdId, householdId),
        gte(schema.spendEvent.date, monthStart),
        lt(schema.spendEvent.date, monthEnd),
      ),
    );
}

/** Transactions bancaires du mois courant sur les comptes de vie courante —
 *  base de l'affectation automatique aux enveloppes. */
async function getSpendingCashflowsThisMonth(accountIds: string[], today: Date) {
  if (accountIds.length === 0) return [];
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  return db
    .select({
      amount: schema.accountCashflow.amount,
      date: schema.accountCashflow.date,
      category: schema.accountCashflow.category,
      transferToAccountId: schema.accountCashflow.transferToAccountId,
    })
    .from(schema.accountCashflow)
    .where(
      and(
        inArray(schema.accountCashflow.accountId, accountIds),
        gte(schema.accountCashflow.date, monthStart),
        lt(schema.accountCashflow.date, monthEnd),
      ),
    );
}

/**
 * Comptes de vie courante : compte dédié si défini, sinon les comptes cash,
 * sinon repli sur l'épargne. Retourne le solde dépensable ET les ids des comptes
 * retenus — ces mêmes comptes alimentent l'affectation des transactions, ce qui
 * garde le solde et la consommation parfaitement cohérents.
 */
function resolveSpendingAccounts(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  spendingAccountId: string | null | undefined,
): { ids: string[]; balance: number } {
  if (spendingAccountId) {
    const acc = accounts.find((a) => a.id === spendingAccountId);
    if (acc) return { ids: [acc.id], balance: acc.currentValue };
  }
  const cash = accounts.filter((a) => a.kind === "cash");
  if (cash.length > 0) {
    return { ids: cash.map((a) => a.id), balance: cash.reduce((s, a) => s + a.currentValue, 0) };
  }
  const savings = accounts.filter((a) => a.kind === "savings");
  return { ids: savings.map((a) => a.id), balance: savings.reduce((s, a) => s + a.currentValue, 0) };
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

  // Comptes de vie courante : leur solde est le « dépensable », et leurs
  // transactions du mois alimentent l'affectation automatique aux enveloppes.
  const spending = resolveSpendingAccounts(accounts, profile?.spendingAccountId);
  const cashflows = await getSpendingCashflowsThisMonth(spending.ids, today);

  const affectEnvelopes = envelopes.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    active: e.active,
    txCategories: parseTxCategories(e.txCategories),
  }));

  // Catégories revendiquées par les charges fixes actives (échéancier) — les
  // dépenses qui y retombent sans enveloppe sont exclues de la dérivation pour
  // ne pas être comptées deux fois (anticipées dans remainingFixed).
  const fixedCategories = new Set<string>(
    expensesRaw.filter((e) => e.flowType === "fixed" && e.active).map((e) => e.category),
  );
  if (mortgages.length > 0) fixedCategories.add("housing");

  // Dépenses dérivées des transactions bancaires (affectation auto) + dépenses
  // saisies à la main. On écarte les `spendEvent` déjà réconciliés à une
  // transaction (`linkedCashflowId`) pour ne pas compter deux fois : les saisies
  // manuelles couvrent surtout les espèces, complémentaires des paiements synchro.
  const derivedSpend = deriveSpendEvents(cashflows, affectEnvelopes, fixedCategories, today);
  const manualSpend = spendEvents
    .filter((s) => !s.linkedCashflowId)
    .map((s) => ({
      amount: s.amount,
      envelopeId: s.envelopeId,
      chargedToBuffer: s.chargedToBuffer,
      date: s.date,
    }));

  const input: AssembleInput = {
    today,
    availableBalance: spending.balance,
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
    spendEvents: [...manualSpend, ...derivedSpend],
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
  const [dashboard, envelopes, cycleRows] = await Promise.all([
    getCashflowDashboard(householdId, today),
    getBudgetEnvelopes(householdId),
    db
      .select()
      .from(schema.monthCycle)
      .where(and(eq(schema.monthCycle.householdId, householdId), eq(schema.monthCycle.month, month)))
      .limit(1),
  ]);

  // Source unique de vérité : la consommation du dashboard (qui fusionne déjà
  // les dépenses manuelles et celles dérivées des transactions bancaires).
  const policyById = new Map(envelopes.map((e) => [e.id, e.rolloverPolicy]));

  const envelopeLines: MonthEnvelopeLine[] = dashboard.envelopes.map((e) => ({
    id: e.id,
    label: e.label,
    planned: e.planned,
    consumed: e.consumed,
    remaining: e.remaining,
  }));

  const rolloverPreview = computeRollover(
    dashboard.envelopes.map((e) => ({
      id: e.id,
      planned: e.planned,
      consumed: e.consumed,
      policy: policyById.get(e.id) ?? "to_savings",
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
