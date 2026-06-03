import { describe, it, expect } from "vitest";
import { forecastEndOfMonth } from "./month-forecast";

describe("forecastEndOfMonth", () => {
  it("dégénère au déterministe sans incertitude", () => {
    const b = forecastEndOfMonth({ projectedEndBalance: 500, uncertainRemaining: 0 });
    expect(b).toEqual({ p10: 500, p50: 500, p90: 500, mean: 500 });
  });

  it("centre la médiane autour du solde projeté", () => {
    const b = forecastEndOfMonth({
      projectedEndBalance: 500,
      uncertainRemaining: 200,
      seed: 42,
    });
    // En moyenne on dépense ~ uncertainRemaining → balance ≈ projeté.
    expect(b.mean).toBeGreaterThan(450);
    expect(b.mean).toBeLessThan(550);
  });

  it("p10 ≤ p50 ≤ p90 (fourchette ordonnée)", () => {
    const b = forecastEndOfMonth({
      projectedEndBalance: 500,
      uncertainRemaining: 300,
      seed: 7,
    });
    expect(b.p10).toBeLessThanOrEqual(b.p50);
    expect(b.p50).toBeLessThanOrEqual(b.p90);
  });

  it("est reproductible avec la même seed", () => {
    const a = forecastEndOfMonth({ projectedEndBalance: 0, uncertainRemaining: 100, seed: 1 });
    const b = forecastEndOfMonth({ projectedEndBalance: 0, uncertainRemaining: 100, seed: 1 });
    expect(a).toEqual(b);
  });
});
