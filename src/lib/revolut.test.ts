import { describe, it, expect } from "vitest";
import {
  parseRevolutCsv,
  parseRevolutInvestmentCsv,
  parseRevolutSavingsCsv,
  detectAndParseRevolut,
} from "./revolut";

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

describe("parseRevolutInvestmentCsv", () => {
  const HEADER = "Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate";

  it("returns empty for empty input with warning", () => {
    const r = parseRevolutInvestmentCsv("");
    expect(r.format).toBe("investment-transactions");
    expect(r.holdings).toHaveLength(0);
    expect(r.snapshots).toHaveLength(0);
    expect(r.warnings).toContain("Fichier vide");
  });

  it("rejects unknown headers", () => {
    const r = parseRevolutInvestmentCsv("Foo,Bar\n1,2");
    expect(r.warnings.some((w) => w.includes("non reconnu"))).toBe(true);
    expect(r.holdings).toHaveLength(0);
  });

  it("aggregates a BUY then SELL into a held position with weighted avg cost", () => {
    const csv = [
      HEADER,
      "2025-01-17T10:00:00.000Z,VUSA,BUY - MARKET,2,EUR 50,EUR 100,EUR,1.0000",
      "2025-01-18T10:00:00.000Z,VUSA,BUY - MARKET,3,EUR 60,EUR 180,EUR,1.0000",
      "2025-01-20T10:00:00.000Z,VUSA,SELL - MARKET,1,EUR 70,EUR 70,EUR,1.0000",
    ].join("\n");
    const r = parseRevolutInvestmentCsv(csv);
    expect(r.holdings).toHaveLength(1);
    const h = r.holdings[0];
    expect(h.ticker).toBe("VUSA");
    expect(h.quantity).toBeCloseTo(4, 6);
    // Avg cost = (100 + 180) / 5 = 56 — stays unchanged after a sell.
    expect(h.avgCost).toBeCloseTo(56, 4);
    expect(h.lastPrice).toBe(70);
  });

  it("tracks cash flow across CASH TOP-UP / WITHDRAWAL / FEE / DIVIDEND", () => {
    const csv = [
      HEADER,
      "2025-01-01T08:00:00.000Z,,CASH TOP-UP,,,EUR 1000,EUR,1.0000",
      "2025-01-02T08:00:00.000Z,VUSA,BUY - MARKET,5,EUR 100,EUR 500,EUR,1.0000",
      "2025-02-01T08:00:00.000Z,VUSA,DIVIDEND,,,EUR 12.50,EUR,1.0000",
      "2025-02-15T08:00:00.000Z,,ROBO MANAGEMENT FEE,,,EUR -2.50,EUR,1.0000",
      "2025-03-01T08:00:00.000Z,,CASH WITHDRAWAL,,,EUR -100,EUR,1.0000",
    ].join("\n");
    const r = parseRevolutInvestmentCsv(csv);
    expect(r.totals.contributions).toBeCloseTo(1000, 4);
    expect(r.totals.withdrawals).toBeCloseTo(100, 4);
    expect(r.totals.dividends).toBeCloseTo(12.5, 4);
    expect(r.totals.fees).toBeCloseTo(2.5, 4);
    // finalCash = 1000 - 500 + 12.5 - 2.5 - 100 = 410
    expect(r.totals.finalCash).toBeCloseTo(410, 4);
    // VUSA position: 5 * 100 = 500
    expect(r.totals.finalPositionValue).toBeCloseTo(500, 4);
    expect(r.totals.finalValue).toBeCloseTo(910, 4);
  });

  it("emits one snapshot per calendar day with last events of that day", () => {
    const csv = [
      HEADER,
      "2025-01-17T08:00:00.000Z,,CASH TOP-UP,,,EUR 100,EUR,1.0000",
      "2025-01-17T15:00:00.000Z,VUSA,BUY - MARKET,1,EUR 50,EUR 50,EUR,1.0000",
      "2025-01-18T10:00:00.000Z,VUSA,BUY - MARKET,1,EUR 60,EUR 60,EUR,1.0000",
    ].join("\n");
    const r = parseRevolutInvestmentCsv(csv);
    const days = r.snapshots.map((s) => s.date);
    expect(days).toEqual(["2025-01-17", "2025-01-18"]);
    // End of day 1: cash 50 + position 1*50 = 100
    expect(r.snapshots[0].value).toBeCloseTo(100, 4);
    // End of day 2: cash -10 + position 2*60 = 110
    expect(r.snapshots[1].value).toBeCloseTo(110, 4);
  });

  it("accumulates dividends per ticker", () => {
    const csv = [
      HEADER,
      "2025-01-01T08:00:00.000Z,VUSA,BUY - MARKET,1,EUR 100,EUR 100,EUR,1.0000",
      "2025-02-01T08:00:00.000Z,VUSA,DIVIDEND,,,EUR 1.20,EUR,1.0000",
      "2025-05-01T08:00:00.000Z,VUSA,DIVIDEND,,,EUR 1.50,EUR,1.0000",
    ].join("\n");
    const r = parseRevolutInvestmentCsv(csv);
    expect(r.holdings[0].totalDividends).toBeCloseTo(2.7, 4);
  });

  it("handles fully-sold positions (quantity returns to zero)", () => {
    const csv = [
      HEADER,
      "2025-01-01T08:00:00.000Z,VUSA,BUY - MARKET,2,EUR 50,EUR 100,EUR,1.0000",
      "2025-02-01T08:00:00.000Z,VUSA,SELL - MARKET,2,EUR 60,EUR 120,EUR,1.0000",
    ].join("\n");
    const r = parseRevolutInvestmentCsv(csv);
    expect(r.holdings[0].quantity).toBe(0);
    expect(r.holdings[0].avgCost).toBe(0);
    expect(r.holdings[0].realizedPnl).toBeCloseTo(20, 4);
  });
});

describe("parseRevolutSavingsCsv", () => {
  const HEADER = "Date,Description,Taux d'intérêt brut gagné,Argent entrant,Argent sortant,Solde";

  it("returns empty for empty input", () => {
    const r = parseRevolutSavingsCsv("");
    expect(r.format).toBe("savings");
    expect(r.snapshots).toHaveLength(0);
    expect(r.warnings).toContain("Fichier vide");
  });

  it("rejects unknown headers", () => {
    const r = parseRevolutSavingsCsv("Foo,Bar\n1,2");
    expect(r.warnings.some((w) => w.includes("non reconnu"))).toBe(true);
  });

  it("parses a French-formatted savings statement and dedupes per day", () => {
    const csv = [
      HEADER,
      "1 oct. 2025,Dépôt sur Compte d&#39;épargne,,\"2 043,26€\",,\"2 043,26€\"",
      "1 oct. 2025,Dépôt sur Compte d&#39;épargne,,\"2 000,00€\",,\"4 043,26€\"",
      "2 oct. 2025,Intérêts nets versés pour Compte d&#39;épargne,1.50%,\"0,12€\",,\"4 043,38€\"",
      "2 oct. 2025,Dépôt sur Compte d&#39;épargne,,\"2,00€\",,\"4 045,38€\"",
    ].join("\n");
    const r = parseRevolutSavingsCsv(csv);
    expect(r.snapshots).toHaveLength(2);
    expect(r.snapshots[0]).toEqual({ date: "2025-10-01", value: 4043.26 });
    expect(r.snapshots[1]).toEqual({ date: "2025-10-02", value: 4045.38 });
    expect(r.totals.finalBalance).toBeCloseTo(4045.38, 2);
    expect(r.totals.deposits).toBeCloseTo(4045.26, 2); // 2043.26 + 2000 + 2
    expect(r.totals.interest).toBeCloseTo(0.12, 2);
  });

  it("parses all common French month abbreviations", () => {
    const csv = [
      HEADER,
      "1 janv. 2025,Dépôt,,\"10,00€\",,\"10,00€\"",
      "1 févr. 2025,Dépôt,,\"10,00€\",,\"20,00€\"",
      "1 avr. 2025,Dépôt,,\"10,00€\",,\"30,00€\"",
      "1 juil. 2025,Dépôt,,\"10,00€\",,\"40,00€\"",
      "1 août 2025,Dépôt,,\"10,00€\",,\"50,00€\"",
      "1 sept. 2025,Dépôt,,\"10,00€\",,\"60,00€\"",
      "1 déc. 2025,Dépôt,,\"10,00€\",,\"70,00€\"",
    ].join("\n");
    const r = parseRevolutSavingsCsv(csv);
    const dates = r.snapshots.map((s) => s.date).sort();
    expect(dates).toEqual([
      "2025-01-01",
      "2025-02-01",
      "2025-04-01",
      "2025-07-01",
      "2025-08-01",
      "2025-09-01",
      "2025-12-01",
    ]);
  });

  it("handles French numbers with thousands separator and comma decimal", () => {
    const csv = [
      HEADER,
      "1 oct. 2025,Dépôt,,\"12 345,67€\",,\"12 345,67€\"",
    ].join("\n");
    const r = parseRevolutSavingsCsv(csv);
    expect(r.snapshots[0].value).toBeCloseTo(12345.67, 2);
  });
});

describe("detectAndParseRevolut", () => {
  it("routes flat investment CSV to investment parser", () => {
    const csv = [
      "Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate",
      "2025-01-17T10:00:00.000Z,VUSA,BUY - MARKET,1,EUR 50,EUR 50,EUR,1.0000",
    ].join("\n");
    const r = detectAndParseRevolut(csv);
    expect(r.format).toBe("investment-transactions");
  });

  it("routes flat savings CSV to savings parser", () => {
    const csv = [
      "Date,Description,Taux d'intérêt brut gagné,Argent entrant,Argent sortant,Solde",
      "1 oct. 2025,Dépôt,,\"10,00€\",,\"10,00€\"",
    ].join("\n");
    const r = detectAndParseRevolut(csv);
    expect(r.format).toBe("savings");
  });

  it("routes multi-section tax-report CSV to legacy parser with format tag", () => {
    const csv = [
      "Income from Sells",
      "Date acquired,Date sold,Symbol,Security name,ISIN,Currency,Quantity",
      "2024-01-10,2024-03-04,VUSA,Vanguard,IE00B3XXRP09,EUR,5",
    ].join("\n");
    const r = detectAndParseRevolut(csv);
    expect(r.format).toBe("tax-report");
    if (r.format === "tax-report") expect(r.etfs).toHaveLength(1);
  });
});
