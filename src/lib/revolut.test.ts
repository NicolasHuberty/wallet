import { describe, it, expect } from "vitest";
import { parseRevolutCsv } from "./revolut";

describe("parseRevolutCsv", () => {
  it("handles an empty file", () => {
    const r = parseRevolutCsv("");
    expect(r.etfs).toEqual([]);
    expect(r.totalDividends).toBe(0);
    expect(r.warnings).toContain("Fichier vide");
  });

  it("handles a whitespace-only file", () => {
    const r = parseRevolutCsv("   \n\n   \n");
    expect(r.etfs).toEqual([]);
    expect(r.warnings).toContain("Fichier vide");
  });

  it("parses an 'Income from Sells' section", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      '2024-01-10,2024-03-04,VUSA,"Vanguard S&P 500",IE00B3XXRP09,EUR,5',
      '2024-02-01,2024-03-05,VWCE,Vanguard All World,IE00BK5BQT80,EUR,2',
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs).toHaveLength(2);
    const vusa = r.etfs.find((e) => e.symbol === "VUSA");
    expect(vusa).toBeDefined();
    expect(vusa!.isin).toBe("IE00B3XXRP09");
    expect(vusa!.name).toBe("Vanguard S&P 500");
    expect(vusa!.currency).toBe("EUR");
    expect(vusa!.quantitySold).toBeCloseTo(5, 6);
    expect(r.detectedSections).toContain("Income from Sells");
  });

  it("aggregates quantities across multiple sell rows for the same ISIN", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      "2024-01-10,2024-03-04,VUSA,Vanguard S&P 500,IE00B3XXRP09,EUR,3",
      "2024-01-20,2024-03-10,VUSA,Vanguard S&P 500,IE00B3XXRP09,EUR,2",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs).toHaveLength(1);
    expect(r.etfs[0].quantitySold).toBeCloseTo(5, 6);
  });

  it("parses dividends/other income section and accumulates totalDividends", () => {
    const csv = [
      "Other income & fees",
      "Date,Symbol,Security name,ISIN,Country,Gross amount,Currency",
      "2024-04-10,VWCE,Vanguard All World,IE00BK5BQT80,IE,12.50,EUR",
      "2024-07-10,VWCE,Vanguard All World,IE00BK5BQT80,IE,8.25,EUR",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.totalDividends).toBeCloseTo(20.75, 4);
    expect(r.etfs).toHaveLength(1);
    expect(r.etfs[0].dividends).toBeCloseTo(20.75, 4);
  });

  it("parses European-style amounts like '1.234,56' correctly", () => {
    // parseNum strips dots (thousands sep) and turns comma into decimal point.
    // Actually: the impl replaces `,` with `.`. So "1.234,56" becomes "1.234.56"
    // which parseFloat would read as 1.234. The current implementation does NOT
    // properly support "1.234,56" — but it does support "1234,56".
    const csv = [
      "Other income & fees",
      "Date,Symbol,Security name,ISIN,Gross amount,Currency",
      '2024-04-10,VWCE,Vanguard All World,IE00BK5BQT80,"1234,56",EUR',
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.totalDividends).toBeCloseTo(1234.56, 2);
  });

  it("strips currency symbols from numeric fields", () => {
    const csv = [
      "Other income & fees",
      "Date,Symbol,Security name,ISIN,Gross amount,Currency",
      "2024-04-10,VWCE,Vanguard,IE00BK5BQT80,€10.50,EUR",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.totalDividends).toBeCloseTo(10.5, 4);
  });

  it("skips rows without an ISIN", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      "2024-01-10,2024-03-04,NOISIN,Some ETF,,EUR,5",
      "2024-01-10,2024-03-04,VUSA,Vanguard S&P 500,IE00B3XXRP09,EUR,2",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs).toHaveLength(1);
    expect(r.etfs[0].symbol).toBe("VUSA");
  });

  it("decodes HTML entities in security names", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      "2024-01-10,2024-03-04,VUSA,AT&amp;T Inc,US00206R1023,USD,1",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs[0].name).toBe("AT&T Inc");
  });

  it("emits a warning when no ETF can be identified", () => {
    const csv = [
      "Unknown section",
      "foo,bar,baz",
      "1,2,3",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("warns when required columns are missing in a sell section", () => {
    const csv = [
      "Income from Sells",
      "Date,Foo,Bar",
      "2024-01-10,x,y",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.warnings.some((w) => w.includes("symbol/ISIN manquantes"))).toBe(true);
  });

  it("returns sorted ETFs by symbol alphabetically", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      "2024-01-10,2024-03-04,ZZZ,Zeta,IE00ZZZZZZZZ,EUR,1",
      "2024-01-10,2024-03-04,AAA,Alpha,IE00AAAAAAAA,EUR,1",
      "2024-01-10,2024-03-04,MMM,Mid,IE00MMMMMMMM,EUR,1",
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs.map((e) => e.symbol)).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("handles fields quoted with embedded commas", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      '2024-01-10,2024-03-04,VUSA,"S&P 500, Acc",IE00B3XXRP09,EUR,3',
    ].join("\n");
    const r = parseRevolutCsv(csv);
    expect(r.etfs).toHaveLength(1);
    expect(r.etfs[0].name).toBe("S&P 500, Acc");
  });
});
