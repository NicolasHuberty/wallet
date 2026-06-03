"use server";

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/demo";
import { getPrimaryHousehold } from "@/lib/queries";
import { envelopeCadence, rolloverPolicy, savingsTargetMode } from "@/db/schema";

/**
 * Cash-flow ("Cap") — server actions du dashboard.
 */

const confirmSpendSchema = z.object({
  amount: z.coerce.number().positive(),
  envelopeId: z.string().nullable().optional(),
  chargedToBuffer: z.boolean().optional().default(false),
  label: z.string().optional().nullable(),
});

/** Confirme une dépense variable (le geste « J'ai dépensé »). */
export async function confirmSpend(values: z.infer<typeof confirmSpendSchema>) {
  assertWritable();
  const p = confirmSpendSchema.parse(values);
  const h = await getPrimaryHousehold();

  // Rattache à l'enveloppe seulement si elle appartient au household.
  let envelopeId: string | null = null;
  if (p.envelopeId && !p.chargedToBuffer) {
    const rows = await db
      .select({ id: schema.budgetEnvelope.id })
      .from(schema.budgetEnvelope)
      .where(
        and(
          eq(schema.budgetEnvelope.id, p.envelopeId),
          eq(schema.budgetEnvelope.householdId, h.id),
        ),
      )
      .limit(1);
    envelopeId = rows[0]?.id ?? null;
  }

  // Rattache au cycle ouvert du mois courant s'il existe.
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const openCycle = await db
    .select({ id: schema.monthCycle.id })
    .from(schema.monthCycle)
    .where(
      and(
        eq(schema.monthCycle.householdId, h.id),
        eq(schema.monthCycle.month, month),
        eq(schema.monthCycle.status, "open"),
      ),
    )
    .limit(1);

  await db.insert(schema.spendEvent).values({
    householdId: h.id,
    cycleId: openCycle[0]?.id ?? null,
    date: now,
    amount: p.amount,
    envelopeId,
    chargedToBuffer: p.chargedToBuffer || envelopeId === null,
    label: p.label ?? null,
    source: "manual",
  });

  revalidatePath("/cashflow");
}

const deleteSpendSchema = z.object({ id: z.string() });

/** Supprime une dépense confirmée (undo / correction). */
export async function deleteSpend(values: z.infer<typeof deleteSpendSchema>) {
  assertWritable();
  const p = deleteSpendSchema.parse(values);
  const h = await getPrimaryHousehold();
  await db
    .delete(schema.spendEvent)
    .where(and(eq(schema.spendEvent.id, p.id), eq(schema.spendEvent.householdId, h.id)));
  revalidatePath("/cashflow");
}

// ──────────────────────────────────────────────────────────────────────
// Configuration : profil financier + enveloppes
// ──────────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  bufferAmount: z.coerce.number().min(0).default(0),
  savingsTargetMode: z.enum(savingsTargetMode).default("max"),
  savingsTargetAmount: z.coerce.number().min(0).nullable().optional(),
  defaultRolloverPolicy: z.enum(rolloverPolicy).default("to_savings"),
});

/** Crée ou met à jour le profil financier (coussin, objectif d'épargne). */
export async function saveFinancialProfile(values: z.infer<typeof profileSchema>) {
  assertWritable();
  const p = profileSchema.parse(values);
  const h = await getPrimaryHousehold();

  const existing = await db
    .select({ id: schema.financialProfile.id })
    .from(schema.financialProfile)
    .where(eq(schema.financialProfile.householdId, h.id))
    .limit(1);

  const payload = {
    bufferAmount: p.bufferAmount,
    savingsTargetMode: p.savingsTargetMode,
    savingsTargetAmount: p.savingsTargetMode === "fixed" ? p.savingsTargetAmount ?? 0 : null,
    defaultRolloverPolicy: p.defaultRolloverPolicy,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(schema.financialProfile)
      .set(payload)
      .where(eq(schema.financialProfile.id, existing[0].id));
  } else {
    await db.insert(schema.financialProfile).values({ householdId: h.id, ...payload });
  }
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
}

const envelopeSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  category: z.string().min(1).default("other"),
  monthlyAmount: z.coerce.number().min(0),
  cadence: z.enum(envelopeCadence).default("monthly"),
  occurrencesPerMonth: z.coerce.number().min(0).nullable().optional(),
  rolloverPolicy: z.enum(rolloverPolicy).default("to_savings"),
});

/** Crée ou met à jour une enveloppe variable. */
export async function saveEnvelope(values: z.infer<typeof envelopeSchema>) {
  assertWritable();
  const p = envelopeSchema.parse(values);
  const h = await getPrimaryHousehold();

  const payload = {
    label: p.label,
    category: p.category,
    monthlyAmount: p.monthlyAmount,
    cadence: p.cadence,
    occurrencesPerMonth: p.occurrencesPerMonth ?? null,
    rolloverPolicy: p.rolloverPolicy,
    updatedAt: new Date(),
  };

  if (p.id) {
    await db
      .update(schema.budgetEnvelope)
      .set(payload)
      .where(
        and(
          eq(schema.budgetEnvelope.id, p.id),
          eq(schema.budgetEnvelope.householdId, h.id),
        ),
      );
  } else {
    await db.insert(schema.budgetEnvelope).values({ householdId: h.id, ...payload });
  }
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
}

const deleteEnvelopeSchema = z.object({ id: z.string() });

/** Supprime une enveloppe. */
export async function deleteEnvelope(values: z.infer<typeof deleteEnvelopeSchema>) {
  assertWritable();
  const p = deleteEnvelopeSchema.parse(values);
  const h = await getPrimaryHousehold();
  await db
    .delete(schema.budgetEnvelope)
    .where(
      and(eq(schema.budgetEnvelope.id, p.id), eq(schema.budgetEnvelope.householdId, h.id)),
    );
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
}
