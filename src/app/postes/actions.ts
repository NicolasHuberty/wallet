"use server";

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrimaryHousehold, getHouseholdCashflows } from "@/lib/queries";
import { assertWritable } from "@/lib/demo";
import { envelopeCadence, rolloverPolicy, flowFrequency } from "@/db/schema";
import { previewPoste, type PostePreview } from "@/lib/postes";
import type { CashflowKind } from "@/db/schema";

const jsonOrNull = (arr: string[] | undefined): string | null =>
  arr && arr.length > 0 ? JSON.stringify(arr) : null;

const posteSchema = z.object({
  kind: z.enum(["variable", "fixed", "oneoff"]),
  id: z.string().optional(),
  label: z.string().min(1),
  category: z.string().min(1).default("other"),
  amount: z.coerce.number().min(0),
  active: z.boolean().default(true),
  txCategories: z.array(z.string()).default([]),
  counterpartyPatterns: z.array(z.string()).default([]),
  // variable
  cadence: z.enum(envelopeCadence).optional(),
  rolloverPolicy: z.enum(rolloverPolicy).optional(),
  occurrencesPerMonth: z.coerce.number().min(0).nullable().optional(),
  // fixed
  frequency: z.enum(flowFrequency).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  // oneoff
  date: z.string().optional(),
  propertyId: z.string().nullable().optional(),
  includeInCostBasis: z.boolean().optional(),
});

export async function savePoste(values: z.infer<typeof posteSchema>) {
  assertWritable();
  const p = posteSchema.parse(values);
  const h = await getPrimaryHousehold();
  const txCats = jsonOrNull(p.txCategories);
  const patterns = jsonOrNull(p.counterpartyPatterns);

  if (p.kind === "variable") {
    const payload = {
      label: p.label,
      category: p.category,
      monthlyAmount: p.amount,
      cadence: p.cadence ?? "monthly",
      occurrencesPerMonth: p.occurrencesPerMonth ?? null,
      rolloverPolicy: p.rolloverPolicy ?? "to_savings",
      txCategories: txCats,
      counterpartyPatterns: patterns,
      updatedAt: new Date(),
    };
    if (p.id) {
      await db
        .update(schema.budgetEnvelope)
        .set(payload)
        .where(and(eq(schema.budgetEnvelope.id, p.id), eq(schema.budgetEnvelope.householdId, h.id)));
    } else {
      await db.insert(schema.budgetEnvelope).values({ householdId: h.id, ...payload });
    }
  } else if (p.kind === "fixed") {
    const payload = {
      label: p.label,
      category: p.category,
      amount: p.amount,
      frequency: p.frequency ?? "monthly",
      dayOfMonth: p.dayOfMonth ?? null,
      flowType: "fixed" as const,
      active: p.active,
      autoConfirm: true,
      txCategories: txCats,
      counterpartyPatterns: patterns,
      updatedAt: new Date(),
    };
    if (p.id) {
      await db
        .update(schema.recurringExpense)
        .set(payload)
        .where(
          and(eq(schema.recurringExpense.id, p.id), eq(schema.recurringExpense.householdId, h.id)),
        );
    } else {
      await db
        .insert(schema.recurringExpense)
        .values({ householdId: h.id, startDate: new Date(), ...payload });
    }
  } else {
    // oneoff
    const date = p.date ? new Date(p.date) : new Date();
    const payload = {
      label: p.label,
      category: p.category,
      amount: p.amount,
      date,
      propertyId: p.propertyId ?? null,
      includeInCostBasis: p.includeInCostBasis ?? false,
      updatedAt: new Date(),
    };
    if (p.id) {
      await db
        .update(schema.oneOffCharge)
        .set(payload)
        .where(and(eq(schema.oneOffCharge.id, p.id), eq(schema.oneOffCharge.householdId, h.id)));
    } else {
      await db.insert(schema.oneOffCharge).values({ householdId: h.id, ...payload });
    }
  }

  revalidatePath("/postes");
  revalidatePath("/cashflow");
}

const deleteSchema = z.object({
  kind: z.enum(["variable", "fixed", "oneoff"]),
  id: z.string().min(1),
});

export async function deletePoste(values: z.infer<typeof deleteSchema>) {
  assertWritable();
  const p = deleteSchema.parse(values);
  const h = await getPrimaryHousehold();
  if (p.kind === "variable") {
    await db
      .delete(schema.budgetEnvelope)
      .where(and(eq(schema.budgetEnvelope.id, p.id), eq(schema.budgetEnvelope.householdId, h.id)));
  } else if (p.kind === "fixed") {
    await db
      .delete(schema.recurringExpense)
      .where(and(eq(schema.recurringExpense.id, p.id), eq(schema.recurringExpense.householdId, h.id)));
  } else {
    await db
      .delete(schema.oneOffCharge)
      .where(and(eq(schema.oneOffCharge.id, p.id), eq(schema.oneOffCharge.householdId, h.id)));
  }
  revalidatePath("/postes");
  revalidatePath("/cashflow");
}

const previewSchema = z.object({
  counterpartyPatterns: z.array(z.string()).default([]),
  txCategories: z.array(z.string()).default([]),
});

/** Aperçu d'impact des règles d'un poste : transactions matchées + total. */
export async function previewPosteMatches(
  values: z.infer<typeof previewSchema>,
): Promise<PostePreview> {
  const p = previewSchema.parse(values);
  const h = await getPrimaryHousehold();
  const rows = await getHouseholdCashflows(h.id);
  const full = previewPoste(
    rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      notes: r.notes,
      category: r.category as never,
      date: r.date,
      kind: r.kind as CashflowKind,
      accountName: r.accountName,
    })),
    p,
  );
  // Limite l'échantillon renvoyé au client (les totaux restent exacts).
  return { ...full, matched: full.matched.slice(0, 60) };
}
