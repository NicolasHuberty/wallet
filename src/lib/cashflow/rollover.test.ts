import { describe, it, expect } from "vitest";
import { computeRollover } from "./rollover";

describe("computeRollover", () => {
  it("envoie le surplus to_savings", () => {
    const r = computeRollover([
      { id: "a", planned: 100, consumed: 70, policy: "to_savings" },
    ]);
    expect(r.toSavings).toBe(30);
    expect(r.carryOver).toEqual({});
    expect(r.forfeited).toBe(0);
  });

  it("reporte le surplus accumulate", () => {
    const r = computeRollover([
      { id: "b", planned: 200, consumed: 120, policy: "accumulate" },
    ]);
    expect(r.carryOver).toEqual({ b: 80 });
    expect(r.toSavings).toBe(0);
  });

  it("perd le surplus reset", () => {
    const r = computeRollover([
      { id: "c", planned: 50, consumed: 10, policy: "reset" },
    ]);
    expect(r.forfeited).toBe(40);
    expect(r.toSavings).toBe(0);
  });

  it("ignore les enveloppes dépassées (pas de surplus négatif)", () => {
    const r = computeRollover([
      { id: "d", planned: 100, consumed: 130, policy: "to_savings" },
    ]);
    expect(r.toSavings).toBe(0);
  });

  it("agrège plusieurs enveloppes mixtes", () => {
    const r = computeRollover([
      { id: "a", planned: 100, consumed: 70, policy: "to_savings" },
      { id: "b", planned: 200, consumed: 120, policy: "accumulate" },
      { id: "c", planned: 50, consumed: 10, policy: "reset" },
      { id: "e", planned: 80, consumed: 80, policy: "to_savings" },
    ]);
    expect(r.toSavings).toBe(30);
    expect(r.carryOver).toEqual({ b: 80 });
    expect(r.forfeited).toBe(40);
  });
});
