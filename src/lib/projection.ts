import type { AccountKind } from "@/db/schema";

type Account = {
  kind: AccountKind;
  currentValue: number;
};

type Scenario = {
  inflationPct: number;
  stockReturnPct: number;
  cashReturnPct: number;
  propertyAppreciationPct: number;
  horizonYears: number;
};

export type AccountWithGrowth = {
  id: string;
  name: string;
  kind: AccountKind;
  currentValue: number;
  annualYieldPct: number | null;
  monthlyContribution: number | null;
};

export type PerAccountProjectionPoint = {
  year: number;
  total: number;
  real: number;
  perAccount: Record<string, number>;
};

const fallbackRate: Record<AccountKind, (s: Scenario) => number> = {
  cash: (s) => s.cashReturnPct,
  savings: (s) => s.cashReturnPct,
  brokerage: (s) => s.stockReturnPct,
  retirement: (s) => s.stockReturnPct,
  crypto: (s) => s.stockReturnPct,
  real_estate: (s) => s.propertyAppreciationPct,
  loan: () => 0,
  credit_card: () => 0,
  other_asset: (s) => s.inflationPct,
};

export function projectPerAccount(
  accounts: AccountWithGrowth[],
  scenario: Scenario
): PerAccountProjectionPoint[] {
  const inflation = scenario.inflationPct / 100;
  const state: Record<string, number> = {};
  const rates: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  for (const a of accounts) {
    state[a.id] = a.currentValue;
    rates[a.id] = ((a.annualYieldPct ?? fallbackRate[a.kind](scenario)) / 100);
    monthly[a.id] = a.monthlyContribution ?? 0;
  }

  const points: PerAccountProjectionPoint[] = [];
  const initialTotal = accounts.reduce((s, a) => s + a.currentValue, 0);
  points.push({ year: 0, total: initialTotal, real: initialTotal, perAccount: { ...state } });

  for (let y = 1; y <= scenario.horizonYears; y++) {
    for (const a of accounts) {
      const r = rates[a.id];
      const m = monthly[a.id];
      // Monthly compounding with monthly contribution
      let v = state[a.id];
      const mRate = Math.pow(1 + r, 1 / 12) - 1;
      for (let i = 0; i < 12; i++) {
        v = v * (1 + mRate) + m;
      }
      state[a.id] = v;
    }
    const total = Object.values(state).reduce((s, v) => s + v, 0);
    const real = total / Math.pow(1 + inflation, y);
    points.push({ year: y, total, real, perAccount: { ...state } });
  }
  return points;
}

type BucketKey = "stocks" | "cash" | "property" | "liability" | "other";

const bucketByKind: Record<AccountKind, BucketKey> = {
  brokerage: "stocks",
  retirement: "stocks",
  crypto: "stocks",
  cash: "cash",
  savings: "cash",
  real_estate: "property",
  loan: "liability",
  credit_card: "liability",
  other_asset: "other",
};

export function projectNetWorth(
  accounts: Account[],
  scenario: Scenario,
  monthlyNetSavings: number,
  opts: { stockSavingsShare?: number } = {}
) {
  const stockShare = opts.stockSavingsShare ?? 0.6;
  const buckets: Record<BucketKey, number> = { stocks: 0, cash: 0, property: 0, liability: 0, other: 0 };
  for (const a of accounts) {
    const b = bucketByKind[a.kind];
    if (b === "liability") buckets.liability += Math.abs(a.currentValue);
    else buckets[b] += a.currentValue;
  }

  const rates = {
    stocks: scenario.stockReturnPct / 100,
    cash: scenario.cashReturnPct / 100,
    property: scenario.propertyAppreciationPct / 100,
    other: scenario.inflationPct / 100,
  };

  const points: Array<{ year: number; nominal: number; real: number; stocks: number; cash: number; property: number; liability: number }> = [];
  points.push({
    year: 0,
    nominal: buckets.stocks + buckets.cash + buckets.property + buckets.other - buckets.liability,
    real: buckets.stocks + buckets.cash + buckets.property + buckets.other - buckets.liability,
    stocks: buckets.stocks,
    cash: buckets.cash,
    property: buckets.property,
    liability: buckets.liability,
  });

  const yearlySavings = monthlyNetSavings * 12;
  const inflation = scenario.inflationPct / 100;

  for (let y = 1; y <= scenario.horizonYears; y++) {
    buckets.stocks = buckets.stocks * (1 + rates.stocks) + yearlySavings * stockShare;
    buckets.cash = buckets.cash * (1 + rates.cash) + yearlySavings * (1 - stockShare);
    buckets.property = buckets.property * (1 + rates.property);
    buckets.other = buckets.other * (1 + rates.other);
    buckets.liability = Math.max(0, buckets.liability * 0.96);

    const nominal = buckets.stocks + buckets.cash + buckets.property + buckets.other - buckets.liability;
    const real = nominal / Math.pow(1 + inflation, y);
    points.push({
      year: y,
      nominal,
      real,
      stocks: buckets.stocks,
      cash: buckets.cash,
      property: buckets.property,
      liability: buckets.liability,
    });
  }
  return points;
}
