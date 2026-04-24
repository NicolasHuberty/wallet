import { describe, it, expect } from "vitest";
import {
  isLiability,
  liabilityKinds,
  resolveCategoryLabel,
  resolveCategoryColor,
  expenseCategoryLabel,
  chargeCategoryColor,
} from "./labels";

describe("isLiability", () => {
  it("returns true for known liability kinds", () => {
    for (const k of liabilityKinds) {
      expect(isLiability(k)).toBe(true);
    }
  });

  it("returns false for typical asset kinds", () => {
    expect(isLiability("cash")).toBe(false);
    expect(isLiability("savings")).toBe(false);
    expect(isLiability("brokerage")).toBe(false);
    expect(isLiability("real_estate")).toBe(false);
    expect(isLiability("crypto")).toBe(false);
  });
});

describe("resolveCategoryLabel", () => {
  it("returns the preset label when known", () => {
    expect(resolveCategoryLabel("housing", expenseCategoryLabel)).toBe("Logement");
  });

  it("falls back to the raw value for custom categories", () => {
    expect(resolveCategoryLabel("custom_cat", expenseCategoryLabel)).toBe("custom_cat");
  });
});

describe("resolveCategoryColor", () => {
  it("returns the preset color when known", () => {
    expect(resolveCategoryColor("notary", chargeCategoryColor)).toBe(chargeCategoryColor.notary);
  });

  it("returns the same color for the same unknown key (deterministic)", () => {
    const a = resolveCategoryColor("completely_custom", chargeCategoryColor);
    const b = resolveCategoryColor("completely_custom", chargeCategoryColor);
    expect(a).toBe(b);
  });

  it("returns a palette color from the chart range for unknown categories", () => {
    const color = resolveCategoryColor("whatever_123", chargeCategoryColor);
    expect(color).toMatch(/^var\(--chart-[1-5]\)$/);
  });
});
