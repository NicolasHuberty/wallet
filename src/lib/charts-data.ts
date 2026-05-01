// Pre-computation helpers for the investment account dashboard charts.
// Pure data transformation: given the raw snapshots / cashflows / holdings
// fetched for an account, output the series each chart component expects.

import type { PerfCashflow, PerfSnapshot } from "./performance";
import { computeTWR } from "./performance";

function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function ymdUtc(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ym(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ─────────────────────────────────────────────────────────────────────
// Hero series: portfolio value vs cumulative net deposits
// ─────────────────────────────────────────────────────────────────────

export type ValueDepositsPoint = {
  date: string; // ISO YYYY-MM-DD
  value: number; // portfolio value at end of day
  netDeposits: number; // cumulative net deposits at this point
  gain: number; // value − netDeposits (could be negative)
};

export function valueAndDepositsSeries(
  snapshots: PerfSnapshot[],
  cashflows: PerfCashflow[],
): ValueDepositsPoint[] {
  if (snapshots.length === 0) return [];

  const sortedCfs = [...cashflows]
    .filter(
      (cf) =>
        cf.kind === "deposit" ||
        cf.kind === "withdrawal" ||
        cf.kind === "transfer_in" ||
        cf.kind === "transfer_out",
    )
    .map((cf) => ({ t: toMs(cf.date), amount: cf.amount }))
    .sort((a, b) => a.t - b.t);

  const sortedSnaps = [...snapshots]
    .map((s) => ({ t: toMs(s.date), value: s.value }))
    .sort((a, b) => a.t - b.t);

  let cfIdx = 0;
  let cumDep = 0;
  const out: ValueDepositsPoint[] = [];
  for (const s of sortedSnaps) {
    while (cfIdx < sortedCfs.length && sortedCfs[cfIdx].t <= s.t) {
      cumDep += sortedCfs[cfIdx].amount;
      cfIdx++;
    }
    out.push({
      date: new Date(s.t).toISOString().slice(0, 10),
      value: s.value,
      netDeposits: cumDep,
      gain: s.value - cumDep,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Drawdown series: % below all-time high snapshot value
// ─────────────────────────────────────────────────────────────────────

export type DrawdownPoint = {
  date: string;
  value: number;
  peak: number;
  drawdownPct: number; // 0 at peak, negative below
};

export function drawdownSeries(snapshots: PerfSnapshot[]): DrawdownPoint[] {
  const sorted = [...snapshots]
    .map((s) => ({ t: toMs(s.date), value: s.value }))
    .sort((a, b) => a.t - b.t);
  let peak = 0;
  const out: DrawdownPoint[] = [];
  for (const s of sorted) {
    if (s.value > peak) peak = s.value;
    const dd = peak > 0 ? (s.value - peak) / peak : 0;
    out.push({
      date: new Date(s.t).toISOString().slice(0, 10),
      value: s.value,
      peak,
      drawdownPct: dd,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Allocation by ticker (current holdings)
// ─────────────────────────────────────────────────────────────────────

export type AllocationSlice = {
  ticker: string;
  name: string | null;
  quantity: number;
  lastPrice: number;
  value: number;
  pct: number;
};

export function allocationByTicker(
  holdings: Array<{
    ticker: string;
    name: string | null;
    quantity: number;
    currentPrice: number;
    avgCost: number;
  }>,
  fallbackTotal?: number,
): AllocationSlice[] {
  const enriched = holdings
    .map((h) => {
      const lastPrice = h.currentPrice || h.avgCost;
      return {
        ticker: h.ticker,
        name: h.name,
        quantity: h.quantity,
        lastPrice,
        value: h.quantity * lastPrice,
      };
    })
    .filter((h) => h.value > 0);
  const total = enriched.reduce((s, h) => s + h.value, 0) || fallbackTotal || 0;
  if (total <= 0) return [];
  return enriched
    .map((h) => ({ ...h, pct: (h.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

// ─────────────────────────────────────────────────────────────────────
// Performance by holding: unrealized gain per ticker
// ─────────────────────────────────────────────────────────────────────

export type HoldingPerfRow = {
  ticker: string;
  quantity: number;
  avgCost: number;
  lastPrice: number;
  value: number;
  costBasis: number;
  unrealizedAbs: number;
  unrealizedPct: number;
};

export function holdingPerf(
  holdings: Array<{
    ticker: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
  }>,
): HoldingPerfRow[] {
  return holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const value = h.quantity * (h.currentPrice || h.avgCost);
      const costBasis = h.quantity * h.avgCost;
      const abs = value - costBasis;
      const pct = costBasis > 0 ? abs / costBasis : 0;
      return {
        ticker: h.ticker,
        quantity: h.quantity,
        avgCost: h.avgCost,
        lastPrice: h.currentPrice || h.avgCost,
        value,
        costBasis,
        unrealizedAbs: abs,
        unrealizedPct: pct,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// ─────────────────────────────────────────────────────────────────────
// Monthly cashflow buckets — bar chart
// ─────────────────────────────────────────────────────────────────────

export type CashflowMonth = {
  month: string; // YYYY-MM
  deposits: number;
  withdrawals: number; // positive number
  dividends: number;
  fees: number; // positive number
  netExternal: number; // deposits - withdrawals
};

export function cashflowsByMonth(cashflows: PerfCashflow[]): CashflowMonth[] {
  const map = new Map<string, CashflowMonth>();
  for (const cf of cashflows) {
    const m = ym(cf.date);
    if (!map.has(m))
      map.set(m, {
        month: m,
        deposits: 0,
        withdrawals: 0,
        dividends: 0,
        fees: 0,
        netExternal: 0,
      });
    const row = map.get(m)!;
    if (cf.kind === "deposit" || cf.kind === "transfer_in")
      row.deposits += Math.max(0, cf.amount);
    else if (cf.kind === "withdrawal" || cf.kind === "transfer_out")
      row.withdrawals += Math.max(0, -cf.amount);
    else if (cf.kind === "dividend") row.dividends += Math.max(0, cf.amount);
    else if (cf.kind === "fee") row.fees += Math.max(0, -cf.amount);
    row.netExternal = row.deposits - row.withdrawals;
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ─────────────────────────────────────────────────────────────────────
// Rolling window TWR (annualized) — for trend over time
// ─────────────────────────────────────────────────────────────────────

export type RollingTwrPoint = {
  date: string;
  rollingTwrAnnualized: number | null;
};

export function rollingTwrSeries(
  snapshots: PerfSnapshot[],
  cashflows: PerfCashflow[],
  windowDays = 90,
): RollingTwrPoint[] {
  if (snapshots.length < 2) return [];
  const sorted = [...snapshots]
    .map((s) => ({ t: toMs(s.date), value: s.value }))
    .sort((a, b) => a.t - b.t);
  const out: RollingTwrPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cutoff = sorted[i].t - windowDays * 24 * 3600 * 1000;
    const subset = sorted.filter((s) => s.t >= cutoff && s.t <= sorted[i].t);
    if (subset.length < 2) {
      out.push({
        date: new Date(sorted[i].t).toISOString().slice(0, 10),
        rollingTwrAnnualized: null,
      });
      continue;
    }
    const subSnaps = subset.map((s) => ({ date: new Date(s.t), value: s.value }));
    const cfsInRange = cashflows.filter((cf) => {
      const t = toMs(cf.date);
      return t >= cutoff && t <= sorted[i].t;
    });
    const r = computeTWR(subSnaps, cfsInRange);
    out.push({
      date: new Date(sorted[i].t).toISOString().slice(0, 10),
      rollingTwrAnnualized: r.twrAnnualized,
    });
  }
  return out;
}

// Re-export utilities for tests / other consumers
export { ymdUtc };
