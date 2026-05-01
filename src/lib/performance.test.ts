import { describe, it, expect } from "vitest";
import {
  computeNetDeposits,
  computeTotalsByKind,
  computeTWR,
  computeXIRR,
  buildPerfReport,
  type PerfCashflow,
  type PerfSnapshot,
} from "./performance";
import { parseRevolutInvestmentCsv } from "./revolut";
import { readFileSync, existsSync } from "node:fs";

describe("computeNetDeposits", () => {
  it("sums deposits and withdrawals", () => {
    const cf: PerfCashflow[] = [
      { date: "2025-01-01", amount: 1000, kind: "deposit" },
      { date: "2025-02-01", amount: -200, kind: "withdrawal" },
      { date: "2025-03-01", amount: 500, kind: "deposit" },
    ];
    const r = computeNetDeposits(cf);
    expect(r.deposits).toBe(1500);
    expect(r.withdrawals).toBe(200);
    expect(r.netDeposits).toBe(1300);
  });

  it("ignores internal flows", () => {
    const cf: PerfCashflow[] = [
      { date: "2025-01-01", amount: 1000, kind: "deposit" },
      { date: "2025-02-01", amount: 50, kind: "dividend" },
      { date: "2025-03-01", amount: -10, kind: "fee" },
      { date: "2025-04-01", amount: -500, kind: "buy" },
      { date: "2025-05-01", amount: 600, kind: "sell" },
    ];
    const r = computeNetDeposits(cf);
    expect(r.deposits).toBe(1000);
    expect(r.netDeposits).toBe(1000);
  });
});

describe("computeTotalsByKind", () => {
  it("sums dividends/fees/interest absolute values with positive convention", () => {
    const cf: PerfCashflow[] = [
      { date: "2025-02-01", amount: 12.5, kind: "dividend" },
      { date: "2025-02-15", amount: -2.5, kind: "fee" },
      { date: "2025-03-01", amount: 0.12, kind: "interest" },
    ];
    const r = computeTotalsByKind(cf);
    expect(r.dividends).toBeCloseTo(12.5, 4);
    expect(r.fees).toBeCloseTo(2.5, 4);
    expect(r.interest).toBeCloseTo(0.12, 4);
  });
});

describe("computeTWR", () => {
  it("returns zero when no snapshots", () => {
    const r = computeTWR([], []);
    expect(r.twr).toBe(0);
    expect(r.twrAnnualized).toBeNull();
  });

  it("captures pure market gain when there is no cash flow", () => {
    const snaps: PerfSnapshot[] = [
      { date: "2025-01-01", value: 1000 },
      { date: "2026-01-01", value: 1100 },
    ];
    const r = computeTWR(snaps, []);
    expect(r.twr).toBeCloseTo(0.1, 4);
    expect(r.twrAnnualized).toBeCloseTo(0.1, 2);
  });

  it("strips out the deposit so a re-up doesn't inflate return", () => {
    // V0 = 1000. After +500 deposit on day 30, V_end_pre = 1050 (5% gain).
    // V[d_curr] = 1050 + 500 = 1550. external CF on d_curr = 500.
    // r = (1550 - 500) / 1000 - 1 = 0.05.
    const snaps: PerfSnapshot[] = [
      { date: "2025-01-01", value: 1000 },
      { date: "2025-01-31", value: 1550 },
    ];
    const cf: PerfCashflow[] = [{ date: "2025-01-31", amount: 500, kind: "deposit" }];
    const r = computeTWR(snaps, cf);
    expect(r.twr).toBeCloseTo(0.05, 4);
  });

  it("chains multiple sub-periods geometrically", () => {
    // Day 0: V=1000.   Day 100: deposit 500, V_end = 1100 (10% market gain) + 500 = 1600.
    // Day 200: V_end = 1700 (~6.25% gain on 1600).
    // True TWR = (1.10 × 1.0625) − 1 ≈ 0.1688
    const snaps: PerfSnapshot[] = [
      { date: "2025-01-01", value: 1000 },
      { date: "2025-04-11", value: 1600 }, // 100d
      { date: "2025-07-20", value: 1700 }, // ~200d total
    ];
    const cf: PerfCashflow[] = [{ date: "2025-04-11", amount: 500, kind: "deposit" }];
    const r = computeTWR(snaps, cf);
    expect(r.twr).toBeCloseTo(1.1 * 1.0625 - 1, 3);
  });
});

describe("computeXIRR", () => {
  it("recovers a known annualized return", () => {
    // Single deposit of 1000 → final value 1100 after exactly 1 year.
    const cf: PerfCashflow[] = [{ date: "2025-01-01", amount: 1000, kind: "deposit" }];
    const r = computeXIRR(cf, "2026-01-01", 1100);
    expect(r.xirr).toBeCloseTo(0.1, 3);
  });

  it("handles regular monthly DCA contributions", () => {
    // 100/month for 12 months, 5% annualized → final ~1234
    // Compute and verify XIRR ≈ 5%
    const cf: PerfCashflow[] = [];
    let total = 0;
    for (let m = 0; m < 12; m++) {
      const date = new Date(Date.UTC(2025, m, 1));
      cf.push({ date, amount: 100, kind: "deposit" });
      // Deposit on month m grows for (12 − m) months until 2026-01-01.
      total += 100 * Math.pow(1.05, (12 - m) / 12);
    }
    const r = computeXIRR(cf, "2026-01-01", total);
    expect(r.xirr).toBeCloseTo(0.05, 2);
  });

  it("returns null when input lacks both signs", () => {
    const cf: PerfCashflow[] = [{ date: "2025-01-01", amount: 1000, kind: "deposit" }];
    expect(computeXIRR(cf, "2025-01-01", 0).xirr).toBeNull();
  });
});

describe("buildPerfReport — integration", () => {
  it("computes coherent metrics for a simple scenario", () => {
    const snaps: PerfSnapshot[] = [
      { date: "2025-01-01", value: 1000 },
      { date: "2026-01-01", value: 1610 },
    ];
    const cf: PerfCashflow[] = [
      { date: "2025-01-01", amount: 1000, kind: "deposit" },
      { date: "2025-07-01", amount: 500, kind: "deposit" },
    ];
    const report = buildPerfReport(snaps, cf, 1610, new Date("2026-01-01"));
    expect(report.netDeposits).toBe(1500);
    expect(report.totalReturnAbs).toBe(110);
    expect(report.totalReturnPct).toBeCloseTo(110 / 1500, 4);
    expect(report.hasEnoughData).toBe(true);
  });

  it("agrees on the user's actual Revolut investment CSV", () => {
    const path = "2B8ECAC5-715C-4480-9030-3BE74FE3D30C.csv";
    if (!existsSync(path)) return; // Skip when file isn't present (CI)
    const csv = readFileSync(path, "utf8");
    const parsed = parseRevolutInvestmentCsv(csv);
    expect(parsed.events.length).toBeGreaterThan(0);

    const snaps = parsed.snapshots.map((s) => ({ date: s.date, value: s.value }));
    const cashflows: PerfCashflow[] = parsed.events.map((e) => ({
      date: e.date,
      amount: e.amount,
      kind: e.kind,
    }));
    const finalDate = parsed.events[parsed.events.length - 1].date;
    const report = buildPerfReport(snaps, cashflows, parsed.totals.finalValue, finalDate);

    // Sanity checks on the numbers we already verified manually:
    expect(report.netDeposits).toBeCloseTo(parsed.totals.contributions - parsed.totals.withdrawals, 2);
    expect(report.dividends).toBeCloseTo(parsed.totals.dividends, 2);
    expect(report.fees).toBeCloseTo(parsed.totals.fees, 2);
    expect(report.totalReturnAbs).toBeCloseTo(parsed.totals.finalValue - report.netDeposits, 2);
    expect(report.hasEnoughData).toBe(true);

    // Plausibility bands — the user's portfolio should land within reasonable
    // bounds, not absurd values that signal a calculation bug.
    if (report.twrAnnualized != null) {
      expect(report.twrAnnualized).toBeGreaterThan(-0.5);
      expect(report.twrAnnualized).toBeLessThan(2);
    }
    if (report.xirr != null) {
      expect(report.xirr).toBeGreaterThan(-0.5);
      expect(report.xirr).toBeLessThan(2);
    }
  });
});
