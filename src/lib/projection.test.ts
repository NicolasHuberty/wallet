import { describe, it, expect } from "vitest";
import {
  projectPerAccount,
  projectNetWorth,
  type AccountWithGrowth,
} from "./projection";

const scenario = {
  inflationPct: 2,
  stockReturnPct: 6,
  cashReturnPct: 1,
  propertyAppreciationPct: 3,
  horizonYears: 10,
};

describe("projectPerAccount", () => {
  it("returns only the initial point when given no accounts", () => {
    const result = projectPerAccount([], { ...scenario, horizonYears: 5 });
    expect(result).toHaveLength(6);
    for (const pt of result) {
      expect(pt.total).toBe(0);
      expect(pt.real).toBe(0);
      expect(pt.perAccount).toEqual({});
    }
  });

  it("year 0 total always matches the sum of current values", () => {
    const accounts: AccountWithGrowth[] = [
      { id: "a", name: "A", kind: "cash", currentValue: 1000, annualYieldPct: 0, monthlyContribution: 0 },
      { id: "b", name: "B", kind: "brokerage", currentValue: 5000, annualYieldPct: 5, monthlyContribution: 0 },
    ];
    const points = projectPerAccount(accounts, scenario);
    expect(points[0].year).toBe(0);
    expect(points[0].total).toBe(6000);
    expect(points[0].real).toBe(6000);
    expect(points[0].perAccount).toEqual({ a: 1000, b: 5000 });
  });

  it("grows a single account with DCA correctly over N months", () => {
    // Closed form with monthly compounding and end-of-month contribution:
    //   FV = P * (1+r)^N + m * ((1+r)^N - 1) / r
    const accounts: AccountWithGrowth[] = [
      {
        id: "a",
        name: "DCA",
        kind: "brokerage",
        currentValue: 10_000,
        annualYieldPct: 12,
        monthlyContribution: 200,
      },
    ];
    const points = projectPerAccount(accounts, { ...scenario, horizonYears: 1 });
    const mRate = Math.pow(1 + 0.12, 1 / 12) - 1;
    const expected = 10_000 * Math.pow(1 + mRate, 12) + 200 * (Math.pow(1 + mRate, 12) - 1) / mRate;
    expect(points[1].total).toBeCloseTo(expected, 4);
    expect(points[1].perAccount.a).toBeCloseTo(expected, 4);
  });

  it("applies fallback rate from scenario when annualYieldPct is null", () => {
    const accounts: AccountWithGrowth[] = [
      {
        id: "cash1",
        name: "Livret",
        kind: "cash",
        currentValue: 1000,
        annualYieldPct: null, // -> uses scenario.cashReturnPct (1%)
        monthlyContribution: 0,
      },
    ];
    const points = projectPerAccount(accounts, { ...scenario, horizonYears: 1 });
    const mRate = Math.pow(1 + 0.01, 1 / 12) - 1;
    const expected = 1000 * Math.pow(1 + mRate, 12);
    expect(points[1].perAccount.cash1).toBeCloseTo(expected, 4);
  });

  it("uses 0% yield for liabilities (loan) so a loan with negative contribution decreases", () => {
    // A loan held as negative current value with negative monthly contribution
    // represents paying principal down.
    const accounts: AccountWithGrowth[] = [
      {
        id: "loan",
        name: "Prêt",
        kind: "loan",
        currentValue: -100_000,
        annualYieldPct: null,
        monthlyContribution: 1_000, // +1000 per month reduces the magnitude of debt
      },
    ];
    const points = projectPerAccount(accounts, { ...scenario, horizonYears: 1 });
    // No interest, just +1000 * 12
    expect(points[1].perAccount.loan).toBeCloseTo(-100_000 + 12_000, 6);
  });

  it("combines multiple accounts and totals equal the sum of per-account values", () => {
    const accounts: AccountWithGrowth[] = [
      { id: "cash", name: "Cash", kind: "cash", currentValue: 2000, annualYieldPct: 1, monthlyContribution: 100 },
      { id: "etf", name: "ETF", kind: "brokerage", currentValue: 5000, annualYieldPct: 7, monthlyContribution: 250 },
      { id: "loan", name: "Prêt", kind: "loan", currentValue: -20_000, annualYieldPct: null, monthlyContribution: 500 },
    ];
    const points = projectPerAccount(accounts, { ...scenario, horizonYears: 5 });
    for (const pt of points) {
      const sum = Object.values(pt.perAccount).reduce((s, v) => s + v, 0);
      expect(pt.total).toBeCloseTo(sum, 6);
    }
  });

  it("real value equals nominal divided by inflation compounded", () => {
    const accounts: AccountWithGrowth[] = [
      { id: "a", name: "A", kind: "cash", currentValue: 10_000, annualYieldPct: 0, monthlyContribution: 0 },
    ];
    const s = { ...scenario, horizonYears: 3, inflationPct: 2 };
    const points = projectPerAccount(accounts, s);
    for (const pt of points) {
      expect(pt.real).toBeCloseTo(pt.total / Math.pow(1.02, pt.year), 6);
    }
  });

  it("produces horizon+1 points (year 0 through year N)", () => {
    const accounts: AccountWithGrowth[] = [
      { id: "a", name: "A", kind: "cash", currentValue: 1, annualYieldPct: 1, monthlyContribution: 0 },
    ];
    const points = projectPerAccount(accounts, { ...scenario, horizonYears: 7 });
    expect(points.map((p) => p.year)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("projectNetWorth", () => {
  it("aggregates accounts by bucket and computes net worth at year 0", () => {
    const accounts = [
      { kind: "brokerage" as const, currentValue: 10_000 },
      { kind: "cash" as const, currentValue: 5_000 },
      { kind: "real_estate" as const, currentValue: 200_000 },
      { kind: "loan" as const, currentValue: -150_000 },
    ];
    const points = projectNetWorth(accounts, scenario, 0);
    const p0 = points[0];
    expect(p0.stocks).toBe(10_000);
    expect(p0.cash).toBe(5_000);
    expect(p0.property).toBe(200_000);
    expect(p0.liability).toBe(150_000);
    expect(p0.nominal).toBe(10_000 + 5_000 + 200_000 - 150_000);
    expect(p0.real).toBe(p0.nominal);
  });

  it("treats liabilities as positive magnitudes regardless of sign", () => {
    const positiveLoan = projectNetWorth(
      [{ kind: "loan" as const, currentValue: 50_000 }],
      scenario,
      0
    );
    const negativeLoan = projectNetWorth(
      [{ kind: "loan" as const, currentValue: -50_000 }],
      scenario,
      0
    );
    expect(positiveLoan[0].liability).toBe(50_000);
    expect(negativeLoan[0].liability).toBe(50_000);
  });

  it("grows stocks by scenario stockReturnPct with savings contribution", () => {
    const points = projectNetWorth(
      [{ kind: "brokerage" as const, currentValue: 1_000 }],
      { ...scenario, horizonYears: 1, stockReturnPct: 10, inflationPct: 0 },
      0,
      { stockSavingsShare: 1 }
    );
    // No savings, pure 10% growth
    expect(points[1].stocks).toBeCloseTo(1_100, 6);
  });

  it("splits monthly savings between stocks and cash per stockSavingsShare", () => {
    const points = projectNetWorth([], { ...scenario, horizonYears: 1, stockReturnPct: 0, cashReturnPct: 0 }, 100, {
      stockSavingsShare: 0.6,
    });
    // yearlySavings = 1200, 60% stocks / 40% cash
    expect(points[1].stocks).toBeCloseTo(720, 6);
    expect(points[1].cash).toBeCloseTo(480, 6);
  });

  it("returns horizonYears+1 points", () => {
    const points = projectNetWorth([], { ...scenario, horizonYears: 20 }, 0);
    expect(points).toHaveLength(21);
  });
});
