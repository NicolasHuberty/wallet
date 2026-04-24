import { describe, it, expect } from "vitest";
import { parseAmortizationPDFText } from "./pdf-amortization";

describe("parseAmortizationPDFText", () => {
  const start = new Date(2024, 0, 1); // January 1, 2024

  it("returns 'none' and a warning when text is empty", () => {
    const r = parseAmortizationPDFText("", start);
    expect(r.rows).toEqual([]);
    expect(r.detectedFormat).toBe("none");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("parses a Crelan-style 5-column table with Belgian numbers", () => {
    // idx | payment | interest | principal | balance
    // payment = interest + principal (within 5%)
    const text = [
      "Échéancier",
      "1 1.000,00 300,00 700,00 99.300,00",
      "2 1.000,00 298,00 702,00 98.598,00",
      "3 1.000,00 296,00 704,00 97.894,00",
    ].join("\n");
    const r = parseAmortizationPDFText(text, start);
    expect(r.detectedFormat).toBe("crelan_5col");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].index).toBe(1);
    expect(r.rows[0].payment).toBeCloseTo(1000, 2);
    expect(r.rows[0].interest).toBeCloseTo(300, 2);
    expect(r.rows[0].principal).toBeCloseTo(700, 2);
    expect(r.rows[0].balance).toBeCloseTo(99_300, 2);
    // dueDate = startDate + index months
    expect(r.rows[0].dueDate.getMonth()).toBe(1); // Feb = 1 (Jan + 1)
    expect(r.rows[2].dueDate.getMonth()).toBe(3); // April = 3 (Jan + 3)
  });

  it("skips lines where payment != interest + principal (outside tolerance)", () => {
    const text = [
      "1 1.000,00 300,00 700,00 99.300,00",
      "2 999,00 500,00 100,00 99.200,00", // 500+100=600, differs from 999 too much
      "3 1.000,00 296,00 704,00 97.894,00",
    ].join("\n");
    const r = parseAmortizationPDFText(text, start);
    expect(r.rows.map((row) => row.index)).toEqual([1, 3]);
  });

  it("skips duplicate or non-increasing indices", () => {
    const text = [
      "1 1.000,00 300,00 700,00 99.300,00",
      "1 1.000,00 300,00 700,00 99.300,00",
      "2 1.000,00 298,00 702,00 98.598,00",
    ].join("\n");
    const r = parseAmortizationPDFText(text, start);
    expect(r.rows.map((row) => row.index)).toEqual([1, 2]);
  });

  it("warns about gaps in numbering", () => {
    const text = [
      "1 1.000,00 300,00 700,00 99.300,00",
      "4 1.000,00 296,00 704,00 97.894,00",
    ].join("\n");
    const r = parseAmortizationPDFText(text, start);
    expect(r.rows).toHaveLength(2);
    expect(r.warnings.some((w) => w.includes("1 → 4"))).toBe(true);
  });

  it("ignores header lines containing letters", () => {
    const text = [
      "Numéro Mensualité Intérêts Capital Solde",
      "1 1.000,00 300,00 700,00 99.300,00",
    ].join("\n");
    const r = parseAmortizationPDFText(text, start);
    expect(r.rows).toHaveLength(1);
  });
});
