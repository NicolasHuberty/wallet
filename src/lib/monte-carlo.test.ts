import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "./monte-carlo";

const scenario = {
  inflationPct: 2,
  stockReturnPct: 6,
  cashReturnPct: 1,
  propertyAppreciationPct: 3,
  horizonYears: 10,
};

const zeroSigma = { stocks: 0, cash: 0, property: 0 };

describe("runMonteCarlo", () => {
  it("produces horizonYears+1 points", () => {
    const points = runMonteCarlo([], scenario, 0, zeroSigma, { simulations: 10, seed: 1 });
    expect(points).toHaveLength(scenario.horizonYears + 1);
  });

  it("percentiles are monotonically ordered at every year", () => {
    const points = runMonteCarlo(
      [{ kind: "brokerage", currentValue: 10_000 }],
      scenario,
      500,
      { stocks: 15, cash: 1, property: 5 },
      { simulations: 200, seed: 123 }
    );
    for (const pt of points) {
      expect(pt.p10).toBeLessThanOrEqual(pt.p25);
      expect(pt.p25).toBeLessThanOrEqual(pt.p50);
      expect(pt.p50).toBeLessThanOrEqual(pt.p75);
      expect(pt.p75).toBeLessThanOrEqual(pt.p90);
    }
  });

  it("is deterministic when given the same seed", () => {
    const accounts = [{ kind: "brokerage" as const, currentValue: 10_000 }];
    const sigma = { stocks: 10, cash: 1, property: 5 };
    const opts = { simulations: 50, seed: 42 };
    const a = runMonteCarlo(accounts, scenario, 200, sigma, opts);
    const b = runMonteCarlo(accounts, scenario, 200, sigma, opts);
    expect(a).toEqual(b);
  });

  it("collapses to deterministic projection when sigma is zero", () => {
    const accounts = [{ kind: "brokerage" as const, currentValue: 10_000 }];
    const points = runMonteCarlo(accounts, { ...scenario, horizonYears: 1 }, 0, zeroSigma, {
      simulations: 5,
      seed: 7,
      stockSavingsShare: 1,
    });
    // With no savings and sigma=0, all percentiles equal the deterministic value:
    // 10_000 * (1 + 0.06) = 10_600
    expect(points[1].p10).toBeCloseTo(10_600, 6);
    expect(points[1].p50).toBeCloseTo(10_600, 6);
    expect(points[1].p90).toBeCloseTo(10_600, 6);
    expect(points[1].mean).toBeCloseTo(10_600, 6);
  });
});
