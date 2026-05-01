// Investment performance metrics — TWR, XIRR, net deposits, dividends, fees.
// Designed to operate on the schema's `account_snapshot` rows (value over
// time) and `account_cashflow` rows (typed external/internal cash flow
// events). Returns are returned as decimal fractions (0.07 = 7 %).

export type PerfSnapshot = { date: Date | string; value: number };
export type PerfCashflow = {
  date: Date | string;
  // Signed: positive = cash flowed INTO the account from outside (deposit /
  // dividend / sell / interest), negative = cash flowed OUT (withdrawal /
  // fee / buy).
  amount: number;
  kind:
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

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isExternal(kind: PerfCashflow["kind"]): boolean {
  return (
    kind === "deposit" ||
    kind === "withdrawal" ||
    kind === "transfer_in" ||
    kind === "transfer_out"
  );
}

// ─────────────────────────────────────────────────────────────────────
// Net deposits / contributions / withdrawals
// ─────────────────────────────────────────────────────────────────────

export function computeNetDeposits(cashflows: PerfCashflow[]): {
  deposits: number;
  withdrawals: number;
  netDeposits: number;
} {
  let deposits = 0;
  let withdrawals = 0;
  for (const cf of cashflows) {
    if (cf.kind === "deposit" || cf.kind === "transfer_in") deposits += Math.max(0, cf.amount);
    else if (cf.kind === "withdrawal" || cf.kind === "transfer_out")
      withdrawals += Math.max(0, -cf.amount);
  }
  return { deposits, withdrawals, netDeposits: deposits - withdrawals };
}

export function computeTotalsByKind(cashflows: PerfCashflow[]): {
  dividends: number;
  fees: number;
  interest: number;
  buys: number;
  sells: number;
} {
  let dividends = 0;
  let fees = 0;
  let interest = 0;
  let buys = 0;
  let sells = 0;
  for (const cf of cashflows) {
    if (cf.kind === "dividend") dividends += Math.max(0, cf.amount);
    else if (cf.kind === "fee") fees += Math.max(0, -cf.amount);
    else if (cf.kind === "interest") interest += Math.max(0, cf.amount);
    else if (cf.kind === "buy") buys += Math.max(0, -cf.amount);
    else if (cf.kind === "sell") sells += Math.max(0, cf.amount);
  }
  return { dividends, fees, interest, buys, sells };
}

// ─────────────────────────────────────────────────────────────────────
// Time-weighted return (TWR)
// ─────────────────────────────────────────────────────────────────────
// For each pair of consecutive snapshots (d_prev, d_curr):
//   r_period = (V[d_curr] - external_CF_on_d_curr) / V[d_prev] - 1
// Then geometric chain: TWR = ∏(1 + r_i) − 1
// Annualize over the full range. The first sub-period is skipped when V[d0]
// is zero (initial deposit). Internal flows (dividend, fee, buy, sell) are
// reflected directly in V — TWR isolates *market* performance from external
// contribution timing.

export type TwrResult = {
  twr: number; // total time-weighted return (decimal, e.g. 0.07 = 7 %)
  twrAnnualized: number | null;
  periodsUsed: number;
  daysCovered: number;
};

export function computeTWR(
  snapshots: PerfSnapshot[],
  cashflows: PerfCashflow[],
): TwrResult {
  if (snapshots.length < 2)
    return { twr: 0, twrAnnualized: null, periodsUsed: 0, daysCovered: 0 };

  const sorted = [...snapshots]
    .map((s) => ({ date: toDate(s.date), value: s.value }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // External CFs grouped by ymd
  const extByDay = new Map<string, number>();
  for (const cf of cashflows) {
    if (!isExternal(cf.kind)) continue;
    const d = toDate(cf.date);
    const k = ymdUTC(d);
    extByDay.set(k, (extByDay.get(k) ?? 0) + cf.amount);
  }

  let chained = 1;
  let periods = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const cfOnCurr = extByDay.get(ymdUTC(curr.date)) ?? 0;
    const vBeforeCurr = curr.value - cfOnCurr;
    if (prev.value <= 0) continue; // can't compute — usually initial seed period
    const r = vBeforeCurr / prev.value - 1;
    if (!isFinite(r)) continue;
    chained *= 1 + r;
    periods++;
  }

  const twr = chained - 1;
  const days =
    (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) /
    (24 * 3600 * 1000);
  let twrAnnualized: number | null = null;
  if (days > 30 && periods > 0) {
    twrAnnualized = Math.pow(1 + twr, 365.25 / days) - 1;
  }
  return { twr, twrAnnualized, periodsUsed: periods, daysCovered: days };
}

// ─────────────────────────────────────────────────────────────────────
// Money-weighted return (XIRR)
// ─────────────────────────────────────────────────────────────────────
// XIRR is the annualized rate r such that NPV(r) = 0 for the personal cash
// flow series. Convention: deposits/withdrawals are inputs, the final
// portfolio value is treated as a synthetic withdrawal at the final date.
// We use external CFs only — internal flows are already reflected in the
// final value.
//
//   NPV(r) = Σ amount_i / (1 + r) ^ ((t_i − t0) / 365.25)
//
// Sign convention here follows the "investor" view: cash flowing INTO the
// investment (deposits) is NEGATIVE for the investor; cash flowing OUT
// (withdrawals + final value) is POSITIVE.

export type XirrResult = {
  xirr: number | null; // decimal, null when no convergence or ill-defined input
  iterations: number;
};

function npv(rate: number, flows: { t: number; amount: number }[]): number {
  let sum = 0;
  for (const f of flows) sum += f.amount / Math.pow(1 + rate, f.t);
  return sum;
}

function dnpv(rate: number, flows: { t: number; amount: number }[]): number {
  let sum = 0;
  for (const f of flows) sum -= (f.t * f.amount) / Math.pow(1 + rate, f.t + 1);
  return sum;
}

export function computeXIRR(
  cashflows: PerfCashflow[],
  finalDate: Date | string,
  finalValue: number,
  initialGuess = 0.1,
): XirrResult {
  // Build investor-view flows: deposit = -amount, withdrawal = +amount.
  // Final value = +finalValue (withdrawing all).
  const ext = cashflows.filter((cf) => isExternal(cf.kind));
  if (ext.length === 0)
    return { xirr: null, iterations: 0 };

  const dates = ext.map((cf) => toDate(cf.date).getTime());
  const t0 = Math.min(...dates);
  const tEnd = toDate(finalDate).getTime();
  if (tEnd <= t0)
    return { xirr: null, iterations: 0 };

  const flows: { t: number; amount: number }[] = [];
  for (const cf of ext) {
    const t = (toDate(cf.date).getTime() - t0) / (1000 * 3600 * 24 * 365.25);
    flows.push({ t, amount: -cf.amount }); // investor view: negate sign
  }
  flows.push({
    t: (tEnd - t0) / (1000 * 3600 * 24 * 365.25),
    amount: finalValue,
  });

  // Need at least one positive and one negative flow
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return { xirr: null, iterations: 0 };

  let r = initialGuess;
  let iter = 0;
  for (; iter < 100; iter++) {
    const f = npv(r, flows);
    if (Math.abs(f) < 1e-7) break;
    const d = dnpv(r, flows);
    if (Math.abs(d) < 1e-12) {
      // Bump and retry
      r += 0.01;
      continue;
    }
    const next = r - f / d;
    if (next <= -0.999) {
      // Avoid (1 + r) → 0 catastrophe
      r = -0.99;
      continue;
    }
    if (Math.abs(next - r) < 1e-8) {
      r = next;
      break;
    }
    r = next;
  }
  if (!isFinite(r) || iter >= 100 && Math.abs(npv(r, flows)) > 1e-3)
    return { xirr: null, iterations: iter };
  return { xirr: r, iterations: iter };
}

// ─────────────────────────────────────────────────────────────────────
// Aggregate report — convenience helper used by the account detail page.
// ─────────────────────────────────────────────────────────────────────

export type PerfReport = {
  // Inputs
  currentValue: number;
  asOfDate: Date;

  // Money in / out
  deposits: number;
  withdrawals: number;
  netDeposits: number;

  // Internal cash flows
  dividends: number;
  fees: number;
  interest: number;
  buys: number;
  sells: number;

  // P&L
  totalReturnAbs: number; // = currentValue - netDeposits
  totalReturnPct: number | null; // = (currentValue - netDeposits) / netDeposits, only when netDeposits > 0

  // Time-weighted
  twr: number;
  twrAnnualized: number | null;

  // Money-weighted
  xirr: number | null;

  // Coverage
  periodsUsed: number;
  daysCovered: number;
  hasEnoughData: boolean;
};

export function buildPerfReport(
  snapshots: PerfSnapshot[],
  cashflows: PerfCashflow[],
  currentValue: number,
  asOfDate: Date = new Date(),
): PerfReport {
  const { deposits, withdrawals, netDeposits } = computeNetDeposits(cashflows);
  const { dividends, fees, interest, buys, sells } = computeTotalsByKind(cashflows);
  const totalReturnAbs = currentValue - netDeposits;
  const totalReturnPct =
    netDeposits > 0 ? totalReturnAbs / netDeposits : null;
  const twrRes = computeTWR(snapshots, cashflows);
  const xirrRes = computeXIRR(cashflows, asOfDate, currentValue);
  return {
    currentValue,
    asOfDate,
    deposits,
    withdrawals,
    netDeposits,
    dividends,
    fees,
    interest,
    buys,
    sells,
    totalReturnAbs,
    totalReturnPct,
    twr: twrRes.twr,
    twrAnnualized: twrRes.twrAnnualized,
    xirr: xirrRes.xirr,
    periodsUsed: twrRes.periodsUsed,
    daysCovered: twrRes.daysCovered,
    hasEnoughData:
      snapshots.length >= 2 &&
      twrRes.daysCovered > 30 &&
      cashflows.some(
        (cf) => cf.kind === "deposit" || cf.kind === "withdrawal",
      ),
  };
}
