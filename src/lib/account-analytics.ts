// Per-account analytics for cash / savings accounts that have a populated
// transaction history (typically populated by GoCardless bank-sync, but
// also Revolut / manual entries). Pure data transforms — no DB / IO.

import {
  classifyTransaction,
  type TransactionCategory,
  transactionCategory,
} from "./transaction-categorizer";

export type AnalyticsCashflow = {
  date: Date | string;
  amount: number;
  notes: string | null;
  ticker?: string | null;
  kind?:
    | "deposit"
    | "withdrawal"
    | "dividend"
    | "fee"
    | "interest"
    | "buy"
    | "sell"
    | "transfer_in"
    | "transfer_out"
    | "other";
};

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function ym(d: Date | string): string {
  const dt = toDate(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── KPIs ────────────────────────────────────────────────────────────

export type AnalyticsKpis = {
  totalIn: number;
  totalOut: number;
  net: number;
  txCount: number;
  averageDailySpend: number;
  averageMonthlyIn: number;
  averageMonthlyOut: number;
  savingsRatePct: number | null; // (in - out) / in
  largestIncome: number;
  largestExpense: number;
  earliestDate: Date | null;
  latestDate: Date | null;
};

export function buildKpis(rows: AnalyticsCashflow[]): AnalyticsKpis {
  if (rows.length === 0) {
    return {
      totalIn: 0,
      totalOut: 0,
      net: 0,
      txCount: 0,
      averageDailySpend: 0,
      averageMonthlyIn: 0,
      averageMonthlyOut: 0,
      savingsRatePct: null,
      largestIncome: 0,
      largestExpense: 0,
      earliestDate: null,
      latestDate: null,
    };
  }
  let totalIn = 0;
  let totalOut = 0;
  let largestIncome = 0;
  let largestExpense = 0;
  let earliest = Infinity;
  let latest = -Infinity;
  for (const r of rows) {
    if (r.amount >= 0) {
      totalIn += r.amount;
      if (r.amount > largestIncome) largestIncome = r.amount;
    } else {
      totalOut += -r.amount;
      if (-r.amount > largestExpense) largestExpense = -r.amount;
    }
    const t = toDate(r.date).getTime();
    if (t < earliest) earliest = t;
    if (t > latest) latest = t;
  }
  const days = Math.max(1, (latest - earliest) / (1000 * 3600 * 24));
  const months = Math.max(1, days / 30.4375);
  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    txCount: rows.length,
    averageDailySpend: totalOut / days,
    averageMonthlyIn: totalIn / months,
    averageMonthlyOut: totalOut / months,
    savingsRatePct: totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : null,
    largestIncome,
    largestExpense,
    earliestDate: new Date(earliest),
    latestDate: new Date(latest),
  };
}

// ─── Spending by category (donut) ────────────────────────────────────

export type CategorySlice = {
  category: TransactionCategory;
  total: number; // signed (negative for expenses, positive for income)
  abs: number; // absolute amount, useful for sorting/charts
  count: number;
  pct: number; // share of total |amount| in this set
};

export function spendingByCategory(rows: AnalyticsCashflow[]): {
  expenses: CategorySlice[];
  income: CategorySlice[];
} {
  const buckets: Record<TransactionCategory, { total: number; count: number }> = Object
    .fromEntries(transactionCategory.map((c) => [c, { total: 0, count: 0 }])) as never;
  for (const r of rows) {
    const cat = classifyTransaction(r);
    buckets[cat].total += r.amount;
    buckets[cat].count++;
  }
  const total = Object.values(buckets).reduce((s, b) => s + Math.abs(b.total), 0);
  const slices: CategorySlice[] = (Object.entries(buckets) as [TransactionCategory, { total: number; count: number }][])
    .filter(([, b]) => b.count > 0)
    .map(([category, b]) => ({
      category,
      total: b.total,
      abs: Math.abs(b.total),
      count: b.count,
      pct: total > 0 ? (Math.abs(b.total) / total) * 100 : 0,
    }));
  return {
    expenses: slices.filter((s) => s.total < 0).sort((a, b) => b.abs - a.abs),
    income: slices.filter((s) => s.total > 0).sort((a, b) => b.abs - a.abs),
  };
}

// ─── Monthly stacked breakdown by category ───────────────────────────

export type MonthlyCategoryRow = {
  month: string; // YYYY-MM
  total: number; // signed
} & Partial<Record<TransactionCategory, number>>;

export function monthlyByCategory(rows: AnalyticsCashflow[]): MonthlyCategoryRow[] {
  const map = new Map<string, MonthlyCategoryRow>();
  for (const r of rows) {
    const m = ym(r.date);
    if (!map.has(m)) map.set(m, { month: m, total: 0 });
    const row = map.get(m)!;
    const cat = classifyTransaction(r);
    row[cat] = (row[cat] ?? 0) + r.amount;
    row.total += r.amount;
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Top merchants ───────────────────────────────────────────────────

export type MerchantRow = {
  name: string;
  category: TransactionCategory;
  total: number; // signed
  abs: number;
  count: number;
};

function normaliseMerchantName(notes: string | null): string {
  if (!notes) return "(non identifié)";
  // Cut off the IBAN / refs / dates often appended at the end
  let s = notes.split(/\s{2,}|—|\bBE\d{2}\b|\bRef\.?:|\b\d{4}-\d{2}-\d{2}\b/)[0]
    .replace(/^\s+|\s+$/g, "")
    .replace(/\s+/g, " ");
  // Cap to 60 chars for display + dedup
  s = s.slice(0, 60);
  // Title-case-ish: keep brand-y casing if first chars upper, otherwise capitalise word starts
  return s || "(non identifié)";
}

export function topMerchants(
  rows: AnalyticsCashflow[],
  opts: { limit?: number; expensesOnly?: boolean } = {},
): MerchantRow[] {
  const limit = opts.limit ?? 15;
  const map = new Map<string, MerchantRow>();
  for (const r of rows) {
    if (opts.expensesOnly && r.amount >= 0) continue;
    const name = normaliseMerchantName(r.notes ?? null);
    const cat = classifyTransaction(r);
    const key = `${name}::${cat}`;
    if (!map.has(key))
      map.set(key, { name, category: cat, total: 0, abs: 0, count: 0 });
    const row = map.get(key)!;
    row.total += r.amount;
    row.abs = Math.abs(row.total);
    row.count++;
  }
  return Array.from(map.values()).sort((a, b) => b.abs - a.abs).slice(0, limit);
}

// ─── Detected subscriptions / recurring monthly debits ───────────────
// Heuristic: same merchant seen in ≥ 3 distinct months, with monthly amounts
// within ±15 % of the median, AND amount < 200 € (filter big rare items).

export type Subscription = {
  name: string;
  category: TransactionCategory;
  monthlyAmount: number; // median absolute amount
  occurrences: number;
  monthsSeen: number;
  totalSpent: number; // sum of |amount|
  firstSeen: Date;
  lastSeen: Date;
};

export function detectSubscriptions(rows: AnalyticsCashflow[]): Subscription[] {
  const byMerchant = new Map<
    string,
    { name: string; category: TransactionCategory; events: { date: Date; amount: number }[] }
  >();
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const amt = -r.amount;
    if (amt < 1 || amt > 200) continue;
    const name = normaliseMerchantName(r.notes ?? null);
    if (name === "(non identifié)") continue;
    const cat = classifyTransaction(r);
    const key = `${name}::${cat}`;
    if (!byMerchant.has(key))
      byMerchant.set(key, { name, category: cat, events: [] });
    byMerchant.get(key)!.events.push({ date: toDate(r.date), amount: amt });
  }

  const out: Subscription[] = [];
  for (const m of byMerchant.values()) {
    if (m.events.length < 3) continue;
    const monthsSeen = new Set(m.events.map((e) => ym(e.date))).size;
    if (monthsSeen < 3) continue;
    const sorted = [...m.events].map((e) => e.amount).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const within = m.events.filter((e) => Math.abs(e.amount - median) / median <= 0.15);
    if (within.length / m.events.length < 0.7) continue; // too inconsistent
    const dates = m.events.map((e) => e.date.getTime());
    out.push({
      name: m.name,
      category: m.category,
      monthlyAmount: median,
      occurrences: m.events.length,
      monthsSeen,
      totalSpent: m.events.reduce((s, e) => s + e.amount, 0),
      firstSeen: new Date(Math.min(...dates)),
      lastSeen: new Date(Math.max(...dates)),
    });
  }
  return out.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

// ─── Largest single transactions ─────────────────────────────────────

export function largestTransactions(
  rows: AnalyticsCashflow[],
  opts: { limit?: number; sign?: "in" | "out" } = {},
): Array<AnalyticsCashflow & { category: TransactionCategory }> {
  const limit = opts.limit ?? 10;
  let filtered = rows;
  if (opts.sign === "in") filtered = filtered.filter((r) => r.amount > 0);
  if (opts.sign === "out") filtered = filtered.filter((r) => r.amount < 0);
  return filtered
    .slice()
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit)
    .map((r) => ({ ...r, category: classifyTransaction(r) }));
}

// ─── Monthly savings rate ────────────────────────────────────────────

export type SavingsRatePoint = {
  month: string;
  income: number;
  expenses: number;
  net: number;
  ratePct: number | null;
};

export function monthlySavingsRate(rows: AnalyticsCashflow[]): SavingsRatePoint[] {
  const map = new Map<string, { income: number; expenses: number }>();
  for (const r of rows) {
    const m = ym(r.date);
    if (!map.has(m)) map.set(m, { income: 0, expenses: 0 });
    const row = map.get(m)!;
    if (r.amount >= 0) row.income += r.amount;
    else row.expenses += -r.amount;
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({
      month,
      income: v.income,
      expenses: v.expenses,
      net: v.income - v.expenses,
      ratePct: v.income > 0 ? ((v.income - v.expenses) / v.income) * 100 : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Daily spend heatmap (calendar) ─────────────────────────────────

export type DailySpend = { date: string; spend: number };

export function dailySpendSeries(rows: AnalyticsCashflow[]): DailySpend[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const d = toDate(r.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + -r.amount);
  }
  return Array.from(map.entries())
    .map(([date, spend]) => ({ date, spend }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
