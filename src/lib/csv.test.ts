import { describe, it, expect } from "vitest";
import { parseAmortizationCSV } from "./csv";

describe("parseAmortizationCSV", () => {
  it("returns a warning when the input is empty", () => {
    const r = parseAmortizationCSV("");
    expect(r.rows).toEqual([]);
    expect(r.warnings).toContain("CSV vide");
  });

  it("returns a warning when there is only a header row", () => {
    const r = parseAmortizationCSV("date,payment,principal,interest,balance");
    expect(r.rows).toEqual([]);
    expect(r.warnings.some((w) => w.includes("Au moins un en-tête"))).toBe(true);
  });

  it("parses a comma-separated file with ISO dates", () => {
    const csv = [
      "date,payment,principal,interest,balance",
      "2024-01-01,1000,700,300,99300",
      "2024-02-01,1000,705,295,98595",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].payment).toBe(1000);
    expect(r.rows[0].principal).toBe(700);
    expect(r.rows[0].interest).toBe(300);
    expect(r.rows[0].balance).toBe(99300);
    expect(r.rows[0].dueDate.getFullYear()).toBe(2024);
    expect(r.rows[0].dueDate.getMonth()).toBe(0);
    expect(r.rows[0].dueDate.getDate()).toBe(1);
  });

  it("detects a semicolon separator and parses French number format", () => {
    const csv = [
      "date;mensualite;capital;interets;capital_restant_du",
      "01/01/2024;1.234,56;800,00;434,56;198.765,44",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].payment).toBeCloseTo(1234.56, 2);
    expect(r.rows[0].principal).toBeCloseTo(800, 2);
    expect(r.rows[0].interest).toBeCloseTo(434.56, 2);
    expect(r.rows[0].balance).toBeCloseTo(198765.44, 2);
  });

  it("supports French header aliases with accents", () => {
    const csv = [
      "échéance;mensualité;capital;intérêts;solde",
      "01/02/2025;500;300;200;10000",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].dueDate.getMonth()).toBe(1); // February = index 1 (dd/mm/yyyy)
    expect(r.rows[0].dueDate.getFullYear()).toBe(2025);
    expect(r.rows[0].payment).toBe(500);
    expect(r.rows[0].principal).toBe(300);
    expect(r.rows[0].interest).toBe(200);
  });

  it("derives payment from principal + interest when the payment column is missing", () => {
    const csv = [
      "date,principal,interest,balance",
      "2024-01-01,700,300,99300",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.rows[0].payment).toBe(1000);
  });

  it("skips malformed rows with invalid dates without crashing", () => {
    const csv = [
      "date,payment,principal,interest,balance",
      "not-a-date,1000,700,300,99300",
      "2024-02-01,1000,705,295,98595",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].balance).toBe(98595);
    expect(r.warnings.some((w) => w.toLowerCase().includes("date"))).toBe(true);
  });

  it("warns when the date column is missing from the header", () => {
    const csv = [
      "foo,payment,principal,interest,balance",
      "x,1000,700,300,99300",
    ].join("\n");
    const r = parseAmortizationCSV(csv);
    expect(r.warnings.some((w) => w.includes("date"))).toBe(true);
  });
});
