"use server";

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeSnapshot } from "@/lib/snapshots";
import { parseRevolutCsv } from "@/lib/revolut";

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
