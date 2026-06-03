import { describe, it, expect } from "vitest";
import { buildCyclePlan, computeSavingsCapacity } from "./cycle";
import type { DatedFlow } from "./occurrences";

describe("buildCyclePlan", () => {
  const salary: DatedFlow = { amount: 2600, dayOfMonth: 28, frequency: "monthly" };
  const rent: DatedFlow = { amount: 900, dayOfMonth: 1, frequency: "monthly" };
  const spotify: DatedFlow = { amount: 11, dayOfMonth: 12, frequency: "monthly" };

  it("agrège revenus, fixes et enveloppes", () => {
    const plan = buildCyclePlan({
      incomes: [salary],
      fixedExpenses: [rent, spotify],
      envelopes: [{ monthlyAmount: 360 }, { monthlyAmount: 120 }],
      savingsTarget: 500,
      bufferAmount: 100,
      openingBalance: 1500,
      year: 2026,
      month0: 5,
    });
    expect(plan.plannedIncome).toBe(2600);
    expect(plan.plannedFixed).toBe(911);
    expect(plan.plannedVariable).toBe(480);
    // 1500 + 2600 - 911 - 480 - 500
    expect(plan.projectedEndBalance).toBe(2209);
  });

  it("ignore les enveloppes inactives et ajoute les reports", () => {
    const plan = buildCyclePlan({
      incomes: [],
      fixedExpenses: [],
      envelopes: [
        { monthlyAmount: 200, active: false },
        { monthlyAmount: 100, carryOver: 30 },
      ],
      savingsTarget: 0,
      bufferAmount: 0,
      openingBalance: 0,
      year: 2026,
      month0: 5,
    });
    expect(plan.plannedVariable).toBe(130);
  });
});

describe("computeSavingsCapacity", () => {
  it("revenus − fixes − variables − coussin", () => {
    expect(
      computeSavingsCapacity({
        monthlyIncome: 2600,
        monthlyFixed: 1120,
        monthlyVariable: 740,
        bufferAmount: 0,
      }),
    ).toBe(740);
  });
});
