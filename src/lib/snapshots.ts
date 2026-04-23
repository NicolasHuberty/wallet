import { db, schema } from "@/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { isLiability } from "./labels";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function recomputeSnapshot(householdId: string, date: Date = new Date()) {
  const accounts = await db.select().from(schema.account).where(eq(schema.account.householdId, householdId));
  let assets = 0;
  let liabilities = 0;
  const byKind: Record<string, number> = {};
  for (const a of accounts) {
    const v = a.currentValue;
    byKind[a.kind] = (byKind[a.kind] ?? 0) + v;
    if (isLiability(a.kind) || v < 0) liabilities += Math.abs(v);
    else assets += v;
  }
  const netWorth = assets - liabilities;

  const day = startOfDay(date);
  const existing = await db
    .select()
    .from(schema.netWorthSnapshot)
    .where(
      and(
        eq(schema.netWorthSnapshot.householdId, householdId),
        gte(schema.netWorthSnapshot.date, day),
        lte(schema.netWorthSnapshot.date, endOfDay(date))
      )
    );

  const payload = {
    householdId,
    date: day,
    totalAssets: assets,
    totalLiabilities: liabilities,
    netWorth,
    breakdown: JSON.stringify(byKind),
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(schema.netWorthSnapshot).set(payload).where(eq(schema.netWorthSnapshot.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db.insert(schema.netWorthSnapshot).values(payload).returning();
  return row.id;
}

export async function upsertManualSnapshot(
  householdId: string,
  date: Date,
  totalAssets: number,
  totalLiabilities: number
) {
  const day = startOfDay(date);
  const netWorth = totalAssets - totalLiabilities;
  const existing = await db
    .select()
    .from(schema.netWorthSnapshot)
    .where(
      and(
        eq(schema.netWorthSnapshot.householdId, householdId),
        gte(schema.netWorthSnapshot.date, day),
        lte(schema.netWorthSnapshot.date, endOfDay(date))
      )
    );
  const payload = {
    householdId,
    date: day,
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown: null,
    updatedAt: new Date(),
  };
  if (existing[0]) {
    await db.update(schema.netWorthSnapshot).set(payload).where(eq(schema.netWorthSnapshot.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db.insert(schema.netWorthSnapshot).values(payload).returning();
  return row.id;
}

export async function deleteSnapshot(id: string) {
  await db.delete(schema.netWorthSnapshot).where(eq(schema.netWorthSnapshot.id, id));
}
