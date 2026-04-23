import type { AccountKind } from "@/db/schema";

type Account = { kind: AccountKind; currentValue: number };

type Scenario = {
  inflationPct: number;
  stockReturnPct: number;
  cashReturnPct: number;
  propertyAppreciationPct: number;
  horizonYears: number;
};

type Sigma = {
  stocks: number;
  cash: number;
  property: number;
};

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

function gaussian(rand: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MonteCarloPoint = {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
};

export function runMonteCarlo(
  accounts: Account[],
  scenario: Scenario,
  monthlyNetSavings: number,
  sigma: Sigma,
  opts: { stockSavingsShare?: number; simulations?: number; seed?: number } = {}
): MonteCarloPoint[] {
  const stockShare = opts.stockSavingsShare ?? 0.6;
  const simulations = opts.simulations ?? 500;
  const rand = mulberry32(opts.seed ?? 42);

  const initial: Record<BucketKey, number> = { stocks: 0, cash: 0, property: 0, liability: 0, other: 0 };
  for (const a of accounts) {
    const b = bucketByKind[a.kind];
    if (b === "liability") initial.liability += Math.abs(a.currentValue);
    else initial[b] += a.currentValue;
  }

  const yearlySavings = monthlyNetSavings * 12;
  const years = scenario.horizonYears;

  const traj: number[][] = Array.from({ length: years + 1 }, () => []);

  for (let s = 0; s < simulations; s++) {
    const buckets = { ...initial };
    traj[0].push(buckets.stocks + buckets.cash + buckets.property + buckets.other - buckets.liability);
    for (let y = 1; y <= years; y++) {
      const rStock = scenario.stockReturnPct / 100 + (sigma.stocks / 100) * gaussian(rand);
      const rCash = scenario.cashReturnPct / 100 + (sigma.cash / 100) * gaussian(rand);
      const rProp = scenario.propertyAppreciationPct / 100 + (sigma.property / 100) * gaussian(rand);
      buckets.stocks = buckets.stocks * (1 + rStock) + yearlySavings * stockShare;
      buckets.cash = buckets.cash * (1 + rCash) + yearlySavings * (1 - stockShare);
      buckets.property = buckets.property * (1 + rProp);
      buckets.other = buckets.other * (1 + scenario.inflationPct / 100);
      buckets.liability = Math.max(0, buckets.liability * 0.96);
      traj[y].push(buckets.stocks + buckets.cash + buckets.property + buckets.other - buckets.liability);
    }
  }

  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  };

  return traj.map((values, year) => ({
    year,
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  }));
}
