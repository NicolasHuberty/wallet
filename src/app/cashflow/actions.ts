"use server";

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/demo";
import { getPrimaryHousehold } from "@/lib/queries";

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
