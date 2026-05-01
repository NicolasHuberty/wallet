// Net-worth projection v2 — month-by-month, per-account.
//
// Goes beyond the bucket-aggregated v1 model by:
//  - Using actual mortgage amortization schedules (one row per month) when
//    available, instead of decaying liabilities at a hardcoded rate.
//  - Tracking each account independently with its own yield + monthly DCA.
//  - Producing per-account series so the UI can stack them.
//  - Surfacing milestones: mortgage payoff year, FIRE year, total DCA,
//    total interest paid.
//
// Pure function: no DB / IO. Caller fetches the data and passes it in.

import type { AccountKind } from "@/db/schema";

export type V2Scenario = {
  horizonYears: number;
  inflationPct: number;
  // Fallback yield % per asset class — used only when an account has no
  // declared annualYieldPct of its own.
  stockReturnPct: number;
  cashReturnPct: number;
  propertyAppreciationPct: number;
  // Annual safe-withdrawal rate used for the FIRE milestone (default 4 %).
  safeWithdrawalPct?: number;
  // Expense growth — typically inflation. Set to 0 to keep expenses flat.
  expenseGrowthPct?: number;
  // Income growth — set to 0 by default (most jobs don't auto-index).
  incomeGrowthPct?: number;
};

export type V2Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currentValue: number; // signed (negative for loans)
  annualYieldPct: number | null; // declared yield, overrides scenario fallback
  monthlyContribution: number | null; // DCA / saving contribution
};

export type V2Amortization = {
  // Sorted ascending by month index from now (0 = next monthly payment).
  entries: { monthIdx: number; payment: number; principal: number; interest: number; balance: number }[];
};

export type V2Inputs = {
  accounts: V2Account[];
  // Optional precise loan schedule per accountId — populated from
  // amortization_entry rows that fall after `today`.
  amortizationByAccountId?: Record<string, V2Amortization>;
  // Optional override of real-estate appreciation per accountId (from the
  // property table).
  realEstateAppreciationByAccountId?: Record<string, number>;
  monthlyIncome: number;
  monthlyExpense: number;
  scenario: V2Scenario;
  // Date from which month index 0 starts. Defaults to today.
  startDate?: Date;
};

export type V2YearPoint = {
  year: number;
  date: string; // ISO YYYY-MM
  total: number; // nominal net worth
  real: number; // inflation-adjusted
  monthlyExpense: number;
  monthlyIncome: number;
  monthlyPassiveIncome: number; // 4 %-rule income from net worth
  perAccount: Record<string, number>;
};

export type V2Milestones = {
  mortgageEndYear: number | null;
  mortgageEndDate: string | null;
  fireYear: number | null; // year offset when passive income ≥ expense
  fireDate: string | null;
  netWorthCrossesZeroYear: number | null;
};

export type V2Kpis = {
  netWorthAtHorizon: number;
  realNetWorthAtHorizon: number;
  totalDcaContributed: number;
  totalInterestPaid: number;
  totalIncome: number;
  totalExpenses: number;
  totalSaved: number;
  growthFromDca: number; // sum of contributions
  growthFromMarket: number; // total - initial - contributions
  initialNetWorth: number;
};

export type V2Result = {
  yearly: V2YearPoint[];
  monthly: V2YearPoint[]; // one entry per month
  perAccount: { id: string; name: string; kind: AccountKind; series: { year: number; value: number }[] }[];
  milestones: V2Milestones;
  kpis: V2Kpis;
};

const fallbackRate = (kind: AccountKind, s: V2Scenario): number => {
  switch (kind) {
    case "cash":
    case "savings":
    case "credit_card":
      return s.cashReturnPct;
    case "brokerage":
    case "retirement":
    case "crypto":
      return s.stockReturnPct;
    case "real_estate":
      return s.propertyAppreciationPct;
    case "loan":
      return 0;
    case "other_asset":
    default:
      return s.inflationPct;
  }
};

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

function ym(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function projectV2(inputs: V2Inputs): V2Result {
  const { accounts, scenario } = inputs;
  const start = inputs.startDate ?? new Date();
  const swr = (scenario.safeWithdrawalPct ?? 4) / 100;
  const expenseGrowthMonthly =
    Math.pow(1 + (scenario.expenseGrowthPct ?? scenario.inflationPct) / 100, 1 / 12) - 1;
  const incomeGrowthMonthly =
    Math.pow(1 + (scenario.incomeGrowthPct ?? 0) / 100, 1 / 12) - 1;
  const inflationMonthly = Math.pow(1 + scenario.inflationPct / 100, 1 / 12) - 1;
  const totalMonths = Math.max(1, Math.round(scenario.horizonYears * 12));

  // Per-account state
  const state: Record<string, number> = {};
  const series: Record<string, number[]> = {};
  const monthlyRate: Record<string, number> = {};
  const monthlyDca: Record<string, number> = {};
  let initialNetWorth = 0;
  let totalDcaContributed = 0;
  let totalInterestPaid = 0;

  for (const a of accounts) {
    state[a.id] = a.currentValue;
    series[a.id] = [a.currentValue];
    initialNetWorth += a.currentValue;
    const r =
      a.kind === "real_estate" && inputs.realEstateAppreciationByAccountId?.[a.id] != null
        ? inputs.realEstateAppreciationByAccountId[a.id] / 100
        : (a.annualYieldPct ?? fallbackRate(a.kind, scenario)) / 100;
    monthlyRate[a.id] = Math.pow(1 + r, 1 / 12) - 1;
    monthlyDca[a.id] = a.monthlyContribution ?? 0;
  }

  let monthlyIncomeNow = inputs.monthlyIncome;
  let monthlyExpenseNow = inputs.monthlyExpense;
  let totalIncomeAccum = 0;
  let totalExpenseAccum = 0;

  let mortgageEndMonth: number | null = null;
  let fireMonth: number | null = null;
  let zeroCrossMonth: number | null = null;

  const yearly: V2YearPoint[] = [];
  const monthly: V2YearPoint[] = [];

  // Snapshot at month 0
  const initialPoint: V2YearPoint = {
    year: 0,
    date: ym(start),
    total: initialNetWorth,
    real: initialNetWorth,
    monthlyExpense: monthlyExpenseNow,
    monthlyIncome: monthlyIncomeNow,
    monthlyPassiveIncome: Math.max(0, initialNetWorth) * (swr / 12),
    perAccount: { ...state },
  };
  yearly.push(initialPoint);
  monthly.push(initialPoint);

  for (let m = 1; m <= totalMonths; m++) {
    for (const a of accounts) {
      if (a.kind === "loan") {
        const sched = inputs.amortizationByAccountId?.[a.id];
        if (sched) {
          // Real schedule: balance from the entry whose monthIdx matches.
          // Entries store the *positive* outstanding balance; the account
          // value should be negative.
          const entry = sched.entries.find((e) => e.monthIdx === m);
          if (entry) {
            state[a.id] = -entry.balance;
            totalInterestPaid += entry.interest;
          } else {
            // Beyond schedule end → fully repaid
            state[a.id] = 0;
          }
        } else {
          // No schedule available → simple linear paydown using DCA
          // (monthlyContribution is interpreted as monthly principal payment).
          const r = monthlyRate[a.id];
          const cap = state[a.id]; // negative
          const payment = monthlyDca[a.id] || 0;
          // interest accrues on remaining balance, payment first goes to interest then principal
          if (cap < 0 && payment > 0) {
            const interest = Math.abs(cap) * r;
            const principal = Math.max(0, payment - interest);
            totalInterestPaid += interest;
            state[a.id] = Math.min(0, cap + principal);
          } else {
            state[a.id] = cap * (1 + r);
          }
        }
        if (mortgageEndMonth == null && state[a.id] >= -0.01 && a.currentValue < 0) {
          mortgageEndMonth = m;
        }
      } else {
        // Compound + DCA. Loans excluded above.
        const dca = monthlyDca[a.id] || 0;
        state[a.id] = state[a.id] * (1 + monthlyRate[a.id]) + dca;
        if (a.kind !== "real_estate") totalDcaContributed += dca;
      }
    }

    monthlyExpenseNow *= 1 + expenseGrowthMonthly;
    monthlyIncomeNow *= 1 + incomeGrowthMonthly;
    totalIncomeAccum += monthlyIncomeNow;
    totalExpenseAccum += monthlyExpenseNow;

    const total = Object.values(state).reduce((s, v) => s + v, 0);
    const realDeflator = Math.pow(1 + inflationMonthly, m);
    const real = total / realDeflator;
    const passive = Math.max(0, total) * (swr / 12);

    if (fireMonth == null && passive >= monthlyExpenseNow && total > 0) {
      fireMonth = m;
    }
    if (zeroCrossMonth == null && total >= 0 && initialNetWorth < 0) {
      zeroCrossMonth = m;
    }

    const point: V2YearPoint = {
      year: m / 12,
      date: ym(addMonths(start, m)),
      total,
      real,
      monthlyExpense: monthlyExpenseNow,
      monthlyIncome: monthlyIncomeNow,
      monthlyPassiveIncome: passive,
      perAccount: { ...state },
    };
    monthly.push(point);
    if (m % 12 === 0) {
      yearly.push({ ...point, year: m / 12 });
      for (const a of accounts) series[a.id].push(state[a.id]);
    }
  }

  const netWorthAtHorizon = yearly[yearly.length - 1].total;
  const realNetWorthAtHorizon = yearly[yearly.length - 1].real;
  const growthFromDca = totalDcaContributed;
  const growthFromMarket = netWorthAtHorizon - initialNetWorth - totalDcaContributed;

  const milestones: V2Milestones = {
    mortgageEndYear: mortgageEndMonth != null ? mortgageEndMonth / 12 : null,
    mortgageEndDate:
      mortgageEndMonth != null ? ym(addMonths(start, mortgageEndMonth)) : null,
    fireYear: fireMonth != null ? fireMonth / 12 : null,
    fireDate: fireMonth != null ? ym(addMonths(start, fireMonth)) : null,
    netWorthCrossesZeroYear: zeroCrossMonth != null ? zeroCrossMonth / 12 : null,
  };

  return {
    yearly,
    monthly,
    perAccount: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      series: series[a.id].map((v, i) => ({ year: i, value: v })),
    })),
    milestones,
    kpis: {
      netWorthAtHorizon,
      realNetWorthAtHorizon,
      totalDcaContributed,
      totalInterestPaid,
      totalIncome: totalIncomeAccum,
      totalExpenses: totalExpenseAccum,
      totalSaved: totalIncomeAccum - totalExpenseAccum,
      growthFromDca,
      growthFromMarket,
      initialNetWorth,
    },
  };
}
