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
import type { EnvelopeView } from "./assemble";
import { buildMonthTransactions, type MonthTransaction } from "./month-expenses";
import { monthlyExpenseTotals, type MonthlySpend } from "@/lib/account-analytics";

/**
 * Cash-flow ("Cap") — couche données serveur. Fetch les rows du household et
 * délègue tout le calcul à `assembleDashboard` (pur, testé). Ne persiste rien :
 * le dashboard est lisible même sans cycle ouvert (ouverture explicite via une
 * action plus tard).
 */

/** Parse un JSON de tableau de chaînes (motifs de contrepartie). */
function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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
      notes: schema.accountCashflow.notes,
      transferToAccountId: schema.accountCashflow.transferToAccountId,
    })
    .from(schema.accountCashflow)
    .where(
      and(
        inArray(schema.accountCashflow.accountId, accountIds),
        gte(schema.accountCashflow.date, monthStart),
        lt(schema.accountCashflow.date, monthEnd),
        // Les transactions ignorées ne consomment ni enveloppe ni coussin.
        eq(schema.accountCashflow.ignored, false),
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
    paidInAdvance: i.paidInAdvance,
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
    counterpartyPatterns: parseStringArray(e.counterpartyPatterns),
  }));

  // Charges fixes actives (échéancier). Les dépenses qui y retombent (par catégorie
  // OU par contrepartie) sont exclues de la dérivation pour ne pas être comptées
  // deux fois (déjà anticipées dans remainingFixed).
  const activeFixed = expensesRaw.filter((e) => e.flowType === "fixed" && e.active);
  const fixedCategories = new Set<string>(activeFixed.map((e) => e.category));
  if (mortgages.length > 0) fixedCategories.add("housing");
  const fixedPatterns = activeFixed.flatMap((e) => parseStringArray(e.counterpartyPatterns));

  // Dépenses dérivées des transactions bancaires (affectation auto) + dépenses
  // saisies à la main. On écarte les `spendEvent` déjà réconciliés à une
  // transaction (`linkedCashflowId`) pour ne pas compter deux fois : les saisies
  // manuelles couvrent surtout les espèces, complémentaires des paiements synchro.
  const derivedSpend = deriveSpendEvents(
    cashflows,
    affectEnvelopes,
    fixedCategories,
    fixedPatterns,
    today,
  );
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

// ──────────────────────────────────────────────────────────────────────
// Vue « Dépenses du mois » — toutes les dépenses des comptes courants,
// rapprochées d'un type et d'une enveloppe + suivi jour/semaine/mois.
// ──────────────────────────────────────────────────────────────────────

/** Parse un `YYYY-MM` (ou maintenant) en repères de mois UTC. */
function parseMonth(month?: string): { year: number; month0: number; monthStr: string } {
  let year: number;
  let month0: number;
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    year = Number(m[1]);
    month0 = Number(m[2]) - 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month0 = now.getUTCMonth();
  }
  return { year, month0, monthStr: `${year}-${String(month0 + 1).padStart(2, "0")}` };
}

/** Comptes « courants » du household : tous les comptes cash (repli vie courante). */
function resolveCurrentAccounts(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  profile: Awaited<ReturnType<typeof getFinancialProfile>>,
): { id: string; name: string }[] {
  const cash = accounts.filter((a) => a.kind === "cash");
  if (cash.length > 0) return cash.map((a) => ({ id: a.id, name: a.name }));
  const fallback = resolveSpendingAccounts(accounts, profile?.spendingAccountId);
  return accounts
    .filter((a) => fallback.ids.includes(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
}

/** Transactions bancaires d'un mois donné pour une liste de comptes. */
async function getBankExpensesForMonth(accountIds: string[], year: number, month0: number) {
  if (accountIds.length === 0) return [];
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 1));
  return db
    .select({
      id: schema.accountCashflow.id,
      accountId: schema.accountCashflow.accountId,
      accountName: schema.account.name,
      date: schema.accountCashflow.date,
      amount: schema.accountCashflow.amount,
      notes: schema.accountCashflow.notes,
      category: schema.accountCashflow.category,
      kind: schema.accountCashflow.kind,
      transferToAccountId: schema.accountCashflow.transferToAccountId,
      ignored: schema.accountCashflow.ignored,
    })
    .from(schema.accountCashflow)
    .innerJoin(schema.account, eq(schema.accountCashflow.accountId, schema.account.id))
    .where(
      and(
        inArray(schema.accountCashflow.accountId, accountIds),
        gte(schema.accountCashflow.date, start),
        lt(schema.accountCashflow.date, end),
      ),
    );
}

/** Dépenses manuelles d'un mois donné. */
async function getSpendEventsForMonth(householdId: string, year: number, month0: number) {
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 1));
  return db
    .select()
    .from(schema.spendEvent)
    .where(
      and(
        eq(schema.spendEvent.householdId, householdId),
        gte(schema.spendEvent.date, start),
        lt(schema.spendEvent.date, end),
      ),
    );
}

/** Total mensuel de dépense (18 derniers mois) sur les comptes courants. */
async function getCurrentAccountsMonthlyTotals(
  accountIds: string[],
  year: number,
  month0: number,
): Promise<MonthlySpend[]> {
  if (accountIds.length === 0) return [];
  const start = new Date(Date.UTC(year, month0 - 17, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 1));
  const rows = await db
    .select({
      date: schema.accountCashflow.date,
      amount: schema.accountCashflow.amount,
      notes: schema.accountCashflow.notes,
      category: schema.accountCashflow.category,
      kind: schema.accountCashflow.kind,
      transferToAccountId: schema.accountCashflow.transferToAccountId,
    })
    .from(schema.accountCashflow)
    .where(
      and(
        inArray(schema.accountCashflow.accountId, accountIds),
        gte(schema.accountCashflow.date, start),
        lt(schema.accountCashflow.date, end),
        eq(schema.accountCashflow.ignored, false),
      ),
    );
  return monthlyExpenseTotals(
    rows.map((r) => ({
      date: r.date,
      amount: r.amount,
      notes: r.notes,
      category: r.category as TransactionCategory | null,
      kind: r.kind,
      transferToAccountId: r.transferToAccountId,
    })),
  );
}

export type MonthExpenseEnvelopeOption = { id: string; label: string; category: string };

export type MonthExpensesData = {
  month: string;
  transactions: MonthTransaction[];
  monthlyTotals: MonthlySpend[];
  envelopes: MonthExpenseEnvelopeOption[];
  accounts: { id: string; name: string }[];
  total: number;
  unaffectedCount: number;
};

/** Vue « Dépenses du mois » : toutes les dépenses des comptes courants, rapprochées. */
export async function getMonthExpenses(
  householdId: string,
  month?: string,
): Promise<MonthExpensesData> {
  const { year, month0, monthStr } = parseMonth(month);
  const [profile, envelopes, accounts, expensesRaw, mortgages] = await Promise.all([
    getFinancialProfile(householdId),
    getBudgetEnvelopes(householdId),
    getAccounts(householdId),
    db
      .select()
      .from(schema.recurringExpense)
      .where(eq(schema.recurringExpense.householdId, householdId)),
    getActiveMortgages(householdId),
  ]);

  const currentAccounts = resolveCurrentAccounts(accounts, profile);
  const accountIds = currentAccounts.map((a) => a.id);

  const [bankRows, manualRows, monthlyTotals] = await Promise.all([
    getBankExpensesForMonth(accountIds, year, month0),
    getSpendEventsForMonth(householdId, year, month0),
    getCurrentAccountsMonthlyTotals(accountIds, year, month0),
  ]);

  const affectEnvelopes = envelopes.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    active: e.active,
    txCategories: parseTxCategories(e.txCategories),
    counterpartyPatterns: parseStringArray(e.counterpartyPatterns),
  }));

  const activeFixed = expensesRaw.filter((e) => e.flowType === "fixed" && e.active);
  const fixedCategories = new Set<string>(activeFixed.map((e) => e.category));
  if (mortgages.length > 0) fixedCategories.add("housing");
  const fixedPatterns = activeFixed.flatMap((e) => parseStringArray(e.counterpartyPatterns));

  const envelopeMeta: Record<string, { label: string; category: string }> = {};
  for (const e of envelopes) envelopeMeta[e.id] = { label: e.label, category: e.category };

  const transactions = buildMonthTransactions({
    bank: bankRows.map((r) => ({
      id: r.id,
      date: r.date,
      amount: r.amount,
      notes: r.notes,
      category: r.category as TransactionCategory | null,
      kind: r.kind,
      transferToAccountId: r.transferToAccountId,
      accountId: r.accountId,
      accountName: r.accountName,
      ignored: r.ignored,
    })),
    manual: manualRows
      .filter((s) => !s.linkedCashflowId)
      .map((s) => ({
        id: s.id,
        date: s.date,
        amount: s.amount,
        envelopeId: s.envelopeId,
        chargedToBuffer: s.chargedToBuffer,
        label: s.label,
      })),
    envelopes: affectEnvelopes,
    envelopeMeta,
    fixedCategories,
    fixedPatterns,
  });

  // Les ignorées ne comptent pas dans la dépense du mois.
  const total = transactions
    .filter((t) => t.affectation !== "ignored")
    .reduce((s, t) => s + t.amount, 0);
  const unaffectedCount = transactions.filter((t) => t.affectation === "buffer").length;

  return {
    month: monthStr,
    transactions,
    monthlyTotals,
    envelopes: envelopes.map((e) => ({ id: e.id, label: e.label, category: e.category })),
    accounts: currentAccounts,
    total,
    unaffectedCount,
  };
}

export type EnvelopeMonthDetail = {
  envelope: EnvelopeView | null;
  transactions: MonthTransaction[];
  month: string;
  rolloverPolicy: string | null;
};

/** Détail d'une enveloppe sur le mois courant : pacing + transactions captées. */
export async function getEnvelopeMonthDetail(
  householdId: string,
  envelopeId: string,
  today: Date = new Date(),
): Promise<EnvelopeMonthDetail> {
  const monthStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const [dashboard, expenses, envelopeRows] = await Promise.all([
    getCashflowDashboard(householdId, today),
    getMonthExpenses(householdId, monthStr),
    getBudgetEnvelopes(householdId),
  ]);
  const envelope = dashboard.envelopes.find((e) => e.id === envelopeId) ?? null;
  const transactions = expenses.transactions.filter((t) => t.envelopeId === envelopeId);
  const rolloverPolicy = envelopeRows.find((e) => e.id === envelopeId)?.rolloverPolicy ?? null;
  return { envelope, transactions, month: monthStr, rolloverPolicy };
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
