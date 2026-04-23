"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accountKind } from "@/db/schema";
import { recomputeSnapshot } from "@/lib/snapshots";
import { assertWritable } from "@/lib/demo";

const upsertSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  name: z.string().min(1),
  kind: z.enum(accountKind),
  institution: z.string().optional().nullable(),
  currency: z.string().default("EUR"),
  currentValue: z.coerce.number(),
  ownership: z.enum(["shared", "member"]).default("shared"),
  ownerMemberId: z.string().optional().nullable(),
  sharedSplitPct: z.coerce.number().min(0).max(100).optional().nullable(),
  annualYieldPct: z.coerce.number().optional().nullable(),
  monthlyContribution: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function saveAccount(values: z.infer<typeof upsertSchema>) {
  assertWritable();
  const parsed = upsertSchema.parse(values);
  const clean = {
    householdId: parsed.householdId,
    name: parsed.name,
    kind: parsed.kind,
    institution: parsed.institution || null,
    currency: parsed.currency || "EUR",
    currentValue: parsed.currentValue,
    ownership: parsed.ownership,
    ownerMemberId: parsed.ownership === "member" ? parsed.ownerMemberId || null : null,
    sharedSplitPct: parsed.ownership === "shared" ? parsed.sharedSplitPct ?? 50 : null,
    annualYieldPct: parsed.annualYieldPct ?? null,
    monthlyContribution: parsed.monthlyContribution ?? null,
    notes: parsed.notes || null,
    updatedAt: new Date(),
  };

  if (parsed.id) {
    await db.update(schema.account).set(clean).where(eq(schema.account.id, parsed.id));
  } else {
    await db.insert(schema.account).values(clean);
  }
  await recomputeSnapshot(parsed.householdId);
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function deleteAccount(id: string) {
  assertWritable();
  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, id));
  await db.delete(schema.account).where(eq(schema.account.id, id));
  if (acc) await recomputeSnapshot(acc.householdId);
  revalidatePath("/accounts");
  revalidatePath("/");
}

// Granular updates for inline editing on /accounts.

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  institution: z.string().optional().nullable(),
  currentValue: z.coerce.number().optional(),
  annualYieldPct: z.coerce.number().optional().nullable(),
  monthlyContribution: z.coerce.number().optional().nullable(),
});

export async function patchAccount(values: z.infer<typeof patchSchema>) {
  assertWritable();
  const p = patchSchema.parse(values);
  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, p.id));
  if (!acc) throw new Error("Compte introuvable");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (p.name !== undefined) patch.name = p.name;
  if (p.institution !== undefined) patch.institution = p.institution || null;
  if (p.currentValue !== undefined) patch.currentValue = p.currentValue;
  if (p.annualYieldPct !== undefined) patch.annualYieldPct = p.annualYieldPct;
  if (p.monthlyContribution !== undefined) patch.monthlyContribution = p.monthlyContribution;

  await db.update(schema.account).set(patch).where(eq(schema.account.id, p.id));
  await recomputeSnapshot(acc.householdId);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${p.id}`);
  revalidatePath("/");
}

// ---------- Historique par compte ----------
const historyPointSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().min(1),
  value: z.coerce.number(),
});

export async function addAccountHistoryPoint(values: z.infer<typeof historyPointSchema>) {
  assertWritable();
  const p = historyPointSchema.parse(values);
  const d = new Date(p.date);
  d.setHours(12, 0, 0, 0);

  const existing = await db
    .select()
    .from(schema.accountSnapshot)
    .where(eq(schema.accountSnapshot.accountId, p.accountId));
  const sameDay = existing.find((s) => {
    const sd = s.date as unknown as Date;
    return (
      sd.getFullYear() === d.getFullYear() &&
      sd.getMonth() === d.getMonth() &&
      sd.getDate() === d.getDate()
    );
  });
  if (sameDay) {
    await db
      .update(schema.accountSnapshot)
      .set({ value: p.value, updatedAt: new Date() })
      .where(eq(schema.accountSnapshot.id, sameDay.id));
  } else {
    await db.insert(schema.accountSnapshot).values({
      accountId: p.accountId,
      date: d,
      value: p.value,
      updatedAt: new Date(),
    });
  }
  revalidatePath(`/accounts/${p.accountId}`);
  revalidatePath("/accounts");
}

export async function deleteAccountHistoryPoint(id: string, accountId: string) {
  assertWritable();
  await db.delete(schema.accountSnapshot).where(eq(schema.accountSnapshot.id, id));
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/accounts");
}
