"use server";

import { db, schema } from "@/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeSnapshot } from "@/lib/snapshots";
import { parseRevolutCsv, parseRevolutInvestmentCsv } from "@/lib/revolut";
import { assertWritable } from "@/lib/demo";

function touch(paths = ["/investments", "/accounts", "/"]) {
  for (const p of paths) revalidatePath(p);
}

// ---------- Wallet basics ----------
const walletSchema = z.object({
  accountId: z.string().min(1),
  currentValue: z.coerce.number(),
  annualYieldPct: z.coerce.number().optional().nullable(),
  monthlyContribution: z.coerce.number().optional().nullable(),
});

export async function saveWalletBasics(values: z.infer<typeof walletSchema>) {
  assertWritable();
  const p = walletSchema.parse(values);
  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, p.accountId));
  if (!acc) throw new Error("Compte introuvable");

  await db
    .update(schema.account)
    .set({
      currentValue: p.currentValue,
      annualYieldPct: p.annualYieldPct ?? null,
      monthlyContribution: p.monthlyContribution ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.account.id, p.accountId));

  await recomputeSnapshot(acc.householdId);
  touch();
}

// ---------- Holdings (allocation-only) ----------
const holdingSchema = z.object({
  id: z.string().optional(),
  accountId: z.string(),
  ticker: z.string().min(1),
  name: z.string().optional().nullable(),
  isin: z.string().optional().nullable(),
  allocationPct: z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function saveHolding(values: z.infer<typeof holdingSchema>) {
  assertWritable();
  const p = holdingSchema.parse(values);
  const data = {
    accountId: p.accountId,
    ticker: p.ticker.toUpperCase(),
    name: p.name || null,
    isin: p.isin || null,
    allocationPct: p.allocationPct ?? null,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.holding).set(data).where(eq(schema.holding.id, p.id));
  } else {
    await db.insert(schema.holding).values({ ...data, quantity: 0, avgCost: 0, currentPrice: 0 });
  }
  touch();
}

export async function deleteHolding(id: string) {
  assertWritable();
  await db.delete(schema.holding).where(eq(schema.holding.id, id));
  touch();
}

const bulkAllocSchema = z.object({
  accountId: z.string().min(1),
  rows: z.array(
    z.object({
      id: z.string().min(1),
      allocationPct: z.coerce.number().min(0).max(100),
    })
  ),
});

export async function bulkUpdateAllocations(values: z.infer<typeof bulkAllocSchema>) {
  assertWritable();
  const p = bulkAllocSchema.parse(values);
  for (const r of p.rows) {
    await db
      .update(schema.holding)
      .set({ allocationPct: r.allocationPct, updatedAt: new Date() })
      .where(eq(schema.holding.id, r.id));
  }
  touch();
}

// ---------- Revolut import (allocation mode) ----------
const revolutImportSchema = z.object({
  accountId: z.string().min(1),
  csv: z.string().min(1),
});

export type RevolutImportOutcome = {
  created: number;
  updated: number;
  totalEtfs: number;
  dividends: number;
  warnings: string[];
};

export async function importRevolutHoldings(
  values: z.infer<typeof revolutImportSchema>
): Promise<RevolutImportOutcome> {
  assertWritable();
  const p = revolutImportSchema.parse(values);
  const result = parseRevolutCsv(p.csv);

  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, p.accountId));
  if (!acc) throw new Error("Compte introuvable");

  let created = 0;
  let updated = 0;

  for (const etf of result.etfs) {
    const existing = await db
      .select()
      .from(schema.holding)
      .where(and(eq(schema.holding.accountId, p.accountId), eq(schema.holding.ticker, etf.symbol)));

    if (existing[0]) {
      await db
        .update(schema.holding)
        .set({
          name: existing[0].name ?? (etf.name || null),
          isin: existing[0].isin ?? etf.isin,
          currency: etf.currency || existing[0].currency,
          updatedAt: new Date(),
        })
        .where(eq(schema.holding.id, existing[0].id));
      updated++;
    } else {
      await db.insert(schema.holding).values({
        accountId: p.accountId,
        ticker: etf.symbol,
        name: etf.name || null,
        isin: etf.isin,
        allocationPct: null,
        quantity: 0,
        avgCost: 0,
        currentPrice: 0,
        currency: etf.currency || "EUR",
        updatedAt: new Date(),
      });
      created++;
    }
  }

  touch();

  return {
    created,
    updated,
    totalEtfs: result.etfs.length,
    dividends: result.totalDividends,
    warnings: result.warnings,
  };
}

// ---------- Revolut transaction history import ----------
// Imports the flat transaction CSV (Date,Ticker,Type,Quantity,Price per
// share,Total Amount,...) into a brokerage account: upserts holdings with
// real quantity & avg cost, writes one accountSnapshot per transaction day,
// and aligns account.currentValue with the last computed value.

export type RevolutTransactionImportOutcome = {
  format: "investment-transactions";
  holdingsCreated: number;
  holdingsUpdated: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  cashflowsImported: number;
  totals: {
    contributions: number;
    withdrawals: number;
    dividends: number;
    fees: number;
    finalCash: number;
    finalPositionValue: number;
    finalValue: number;
    eventCount: number;
  };
  warnings: string[];
};

export async function importRevolutTransactions(
  values: z.infer<typeof revolutImportSchema>,
): Promise<RevolutTransactionImportOutcome> {
  assertWritable();
  const p = revolutImportSchema.parse(values);
  const result = parseRevolutInvestmentCsv(p.csv);

  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, p.accountId));
  if (!acc) throw new Error("Compte introuvable");

  let holdingsCreated = 0;
  let holdingsUpdated = 0;

  for (const h of result.holdings) {
    const [existing] = await db
      .select()
      .from(schema.holding)
      .where(and(eq(schema.holding.accountId, p.accountId), eq(schema.holding.ticker, h.ticker)));

    if (existing) {
      await db
        .update(schema.holding)
        .set({
          name: existing.name,
          isin: existing.isin,
          quantity: h.quantity,
          avgCost: h.avgCost,
          currentPrice: h.lastPrice || existing.currentPrice,
          currency: h.currency || existing.currency,
          updatedAt: new Date(),
        })
        .where(eq(schema.holding.id, existing.id));
      holdingsUpdated++;
    } else {
      await db.insert(schema.holding).values({
        accountId: p.accountId,
        ticker: h.ticker,
        name: null,
        isin: null,
        allocationPct: null,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice: h.lastPrice,
        currency: h.currency || "EUR",
        updatedAt: new Date(),
      });
      holdingsCreated++;
    }
  }

  let snapshotsCreated = 0;
  let snapshotsUpdated = 0;

  if (result.snapshots.length > 0) {
    const minDate = new Date(`${result.snapshots[0].date}T00:00:00Z`);
    const maxDate = new Date(`${result.snapshots[result.snapshots.length - 1].date}T23:59:59Z`);
    const existing = await db
      .select()
      .from(schema.accountSnapshot)
      .where(
        and(
          eq(schema.accountSnapshot.accountId, p.accountId),
          gte(schema.accountSnapshot.date, minDate),
          lte(schema.accountSnapshot.date, maxDate),
        ),
      );
    const byDay = new Map<string, (typeof existing)[number]>();
    for (const s of existing) {
      const d = new Date(s.date as unknown as string | Date);
      const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      byDay.set(ymd, s);
    }

    for (const snap of result.snapshots) {
      const date = new Date(`${snap.date}T12:00:00Z`);
      const prev = byDay.get(snap.date);
      if (prev) {
        await db
          .update(schema.accountSnapshot)
          .set({ value: snap.value, date, updatedAt: new Date() })
          .where(eq(schema.accountSnapshot.id, prev.id));
        snapshotsUpdated++;
      } else {
        await db.insert(schema.accountSnapshot).values({
          accountId: p.accountId,
          date,
          value: snap.value,
          updatedAt: new Date(),
        });
        snapshotsCreated++;
      }
    }
  }

  if (result.snapshots.length > 0) {
    await db
      .update(schema.account)
      .set({ currentValue: result.totals.finalValue, updatedAt: new Date() })
      .where(eq(schema.account.id, p.accountId));
  }

  // Persist cash flow events (idempotent re-import: delete prior import-sourced
  // rows for this account, re-insert from the parsed CSV). Manual rows are
  // preserved.
  let cashflowsImported = 0;
  if (result.events.length > 0) {
    await db
      .delete(schema.accountCashflow)
      .where(
        and(
          eq(schema.accountCashflow.accountId, p.accountId),
          eq(schema.accountCashflow.source, "revolut_import"),
        ),
      );
    const rows = result.events.map((e) => ({
      accountId: p.accountId,
      date: e.date,
      kind: e.kind,
      amount: e.amount,
      ticker: e.ticker ?? null,
      notes: null,
      source: "revolut_import" as const,
      updatedAt: new Date(),
    }));
    // Chunk inserts to keep individual statements small.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(schema.accountCashflow).values(rows.slice(i, i + CHUNK));
    }
    cashflowsImported = rows.length;
  }

  await recomputeSnapshot(acc.householdId);
  touch();

  return {
    format: "investment-transactions",
    holdingsCreated,
    holdingsUpdated,
    snapshotsCreated,
    snapshotsUpdated,
    cashflowsImported,
    totals: {
      contributions: result.totals.contributions,
      withdrawals: result.totals.withdrawals,
      dividends: result.totals.dividends,
      fees: result.totals.fees,
      finalCash: result.totals.finalCash,
      finalPositionValue: result.totals.finalPositionValue,
      finalValue: result.totals.finalValue,
      eventCount: result.totals.eventCount,
    },
    warnings: result.warnings,
  };
}
