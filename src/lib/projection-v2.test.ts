import { describe, it, expect } from "vitest";
import { projectV2, type V2Inputs } from "./projection-v2";

const baseScenario = {
  horizonYears: 10,
  inflationPct: 2,
  stockReturnPct: 6,
  cashReturnPct: 2,
  propertyAppreciationPct: 2.5,
};

describe("projectV2 — basics", () => {
  it("preserves net worth when no growth and no DCA", () => {
    const r = projectV2({
      accounts: [
        {
          id: "a",
          name: "Cash",
          kind: "cash",
          currentValue: 1000,
          annualYieldPct: 0,
          monthlyContribution: null,
        },
      ],
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, inflationPct: 0 },
    });
    expect(r.yearly[0].total).toBe(1000);
    expect(r.yearly[r.yearly.length - 1].total).toBe(1000);
  });

  it("grows a brokerage account at declared yield", () => {
    const r = projectV2({
      accounts: [
        {
          id: "b",
          name: "Wallet",
          kind: "brokerage",
          currentValue: 1000,
          annualYieldPct: 7,
          monthlyContribution: null,
        },
      ],
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, horizonYears: 1 },
    });
    expect(r.yearly[r.yearly.length - 1].total).toBeCloseTo(1070, 0);
  });

  it("compounds DCA correctly", () => {
    // 100/month for 1 year at 6 %/yr. Sum approximation ≈ 1234
    const r = projectV2({
      accounts: [
        {
          id: "b",
          name: "DCA",
          kind: "brokerage",
          currentValue: 0,
          annualYieldPct: 6,
          monthlyContribution: 100,
        },
      ],
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, horizonYears: 1 },
    });
    const final = r.yearly[r.yearly.length - 1].total;
    expect(final).toBeGreaterThan(1230);
    expect(final).toBeLessThan(1240);
    expect(r.kpis.totalDcaContributed).toBe(1200);
  });

  it("uses real amortization schedule when provided", () => {
    // Mortgage 100 000 € balance now, schedule says balance reaches 0 at month 12.
    const entries = [];
    for (let m = 1; m <= 12; m++) {
      entries.push({
        monthIdx: m,
        payment: 8500,
        principal: m < 12 ? 8000 : 100000 - 8000 * 11,
        interest: 500,
        balance: m < 12 ? 100000 - 8000 * m : 0,
      });
    }
    const r = projectV2({
      accounts: [
        {
          id: "loan",
          name: "Prêt",
          kind: "loan",
          currentValue: -100000,
          annualYieldPct: 0,
          monthlyContribution: null,
        },
      ],
      amortizationByAccountId: { loan: { entries } },
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, horizonYears: 2 },
    });
    expect(r.milestones.mortgageEndYear).toBe(1); // exactly 12 months
    // Net worth at year 2 = 0 (loan repaid, no other accounts)
    expect(r.yearly[r.yearly.length - 1].total).toBe(0);
    // Total interest = 12 × 500 = 6000
    expect(r.kpis.totalInterestPaid).toBeCloseTo(6000, 0);
  });

  it("computes per-account series at each year", () => {
    const r = projectV2({
      accounts: [
        {
          id: "h",
          name: "Maison",
          kind: "real_estate",
          currentValue: 300000,
          annualYieldPct: null,
          monthlyContribution: null,
        },
        {
          id: "b",
          name: "Wallet",
          kind: "brokerage",
          currentValue: 5000,
          annualYieldPct: 7,
          monthlyContribution: 200,
        },
      ],
      realEstateAppreciationByAccountId: { h: 2 },
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, horizonYears: 5 },
    });
    expect(r.perAccount).toHaveLength(2);
    expect(r.perAccount[0].series).toHaveLength(6); // year 0..5 inclusive
    // Maison year 5 ≈ 300000 × 1.02^5 ≈ 331224
    expect(r.perAccount[0].series[5].value).toBeCloseTo(331224, -1);
  });

  it("detects FIRE year when passive income covers expenses", () => {
    // 1 000 000 € at 0 % growth, 4 % SWR → 40 000/yr ≈ 3 333/month passive
    // Set expense at 3 000/month → FIRE should fire on month 1 since
    // passive > expense from the start.
    const r = projectV2({
      accounts: [
        {
          id: "x",
          name: "FIRE pot",
          kind: "brokerage",
          currentValue: 1_000_000,
          annualYieldPct: 0,
          monthlyContribution: null,
        },
      ],
      monthlyIncome: 0,
      monthlyExpense: 3000,
      scenario: { ...baseScenario, horizonYears: 5, expenseGrowthPct: 0 },
    });
    expect(r.milestones.fireYear).toBeCloseTo(1 / 12, 3);
  });

  it("attributes growth split between DCA contributions and market", () => {
    const r = projectV2({
      accounts: [
        {
          id: "b",
          name: "DCA",
          kind: "brokerage",
          currentValue: 0,
          annualYieldPct: 6,
          monthlyContribution: 100,
        },
      ],
      monthlyIncome: 0,
      monthlyExpense: 0,
      scenario: { ...baseScenario, horizonYears: 10 },
    });
    expect(r.kpis.growthFromDca).toBe(12000);
    // total ≈ 16470, market ≈ 4470
    expect(r.kpis.growthFromMarket).toBeGreaterThan(4000);
    expect(r.kpis.growthFromMarket).toBeLessThan(5000);
  });
});
