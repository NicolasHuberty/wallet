"use server";

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/demo";
import { getPrimaryHousehold } from "@/lib/queries";
import {
  envelopeCadence,
  rolloverPolicy,
  savingsTargetMode,
  profileComposition,
} from "@/db/schema";
import {
  getCashflowDashboard,
  getBudgetEnvelopes,
  getSpendEventsThisMonth,
} from "@/lib/cashflow/data";
import { computeRollover, type RolloverEnvelope } from "@/lib/cashflow/rollover";
import { recomputeSnapshot } from "@/lib/snapshots";

function currentMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

  const [created] = await db
    .insert(schema.spendEvent)
    .values({
      householdId: h.id,
      cycleId: openCycle[0]?.id ?? null,
      date: now,
      amount: p.amount,
      envelopeId,
      chargedToBuffer: p.chargedToBuffer || envelopeId === null,
      label: p.label ?? null,
      source: "manual",
    })
    .returning({ id: schema.spendEvent.id });

  revalidatePath("/cashflow");
  return { id: created.id };
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

// ──────────────────────────────────────────────────────────────────────
// Cycle mensuel : ouverture / clôture (Phase 7)
// ──────────────────────────────────────────────────────────────────────

/**
 * Ouvre (ou récupère) le cycle du mois courant en figeant le plan : revenus,
 * fixes, variables, objectif d'épargne, coussin, solde d'ouverture.
 */
export async function openCycle() {
  assertWritable();
  const h = await getPrimaryHousehold();
  const now = new Date();
  const month = currentMonth(now);

  const existing = await db
    .select({ id: schema.monthCycle.id })
    .from(schema.monthCycle)
    .where(and(eq(schema.monthCycle.householdId, h.id), eq(schema.monthCycle.month, month)))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, alreadyOpen: true };

  const data = await getCashflowDashboard(h.id, now);
  const [created] = await db
    .insert(schema.monthCycle)
    .values({
      householdId: h.id,
      month,
      status: "open",
      plannedIncome: data.plannedIncome,
      plannedFixed: data.plannedFixed,
      plannedVariable: data.plannedVariable,
      savingsTarget: data.committedSavings,
      bufferAmount: data.bufferAmount,
      openingBalance: data.availableBalance,
    })
    .returning({ id: schema.monthCycle.id });

  revalidatePath("/cashflow");
  revalidatePath("/cashflow/month");
  return { id: created.id, alreadyOpen: false };
}

/**
 * Clôture le cycle du mois courant : applique le débordement des enveloppes,
 * fige le résultat (épargne réelle, écart au plan) et pousse un snapshot de
 * patrimoine (jonction avec la partie patrimoine).
 */
export async function closeCycle() {
  assertWritable();
  const h = await getPrimaryHousehold();
  const now = new Date();
  const month = currentMonth(now);

  const cycleRows = await db
    .select()
    .from(schema.monthCycle)
    .where(and(eq(schema.monthCycle.householdId, h.id), eq(schema.monthCycle.month, month)))
    .limit(1);
  const cycle = cycleRows[0];
  if (!cycle) throw new Error("Aucun cycle ouvert ce mois-ci.");
  if (cycle.status === "closed") return { alreadyClosed: true, toSavings: 0 };

  const [envelopes, spendEvents] = await Promise.all([
    getBudgetEnvelopes(h.id),
    getSpendEventsThisMonth(h.id, now),
  ]);

  const consumedByEnvelope = new Map<string, number>();
  let bufferConsumed = 0;
  for (const s of spendEvents) {
    if (s.chargedToBuffer || s.envelopeId === null) bufferConsumed += s.amount;
    else
      consumedByEnvelope.set(
        s.envelopeId,
        (consumedByEnvelope.get(s.envelopeId) ?? 0) + s.amount,
      );
  }

  const rolloverEnvelopes: RolloverEnvelope[] = envelopes
    .filter((e) => e.active)
    .map((e) => ({
      id: e.id,
      planned: e.monthlyAmount,
      consumed: consumedByEnvelope.get(e.id) ?? 0,
      policy: e.rolloverPolicy,
    }));
  const rollover = computeRollover(rolloverEnvelopes);

  const variableConsumed =
    [...consumedByEnvelope.values()].reduce((s, v) => s + v, 0) + bufferConsumed;
  const discretionaryPlan = cycle.plannedVariable + cycle.bufferAmount;
  const varianceVsPlan = discretionaryPlan - variableConsumed;
  const actualSaved = cycle.savingsTarget + rollover.toSavings;

  await db
    .update(schema.monthCycle)
    .set({
      status: "closed",
      closedAt: now,
      actualSaved,
      varianceVsPlan,
      updatedAt: now,
    })
    .where(eq(schema.monthCycle.id, cycle.id));

  // Jonction patrimoine : snapshot net worth à la clôture.
  await recomputeSnapshot(h.id, now);

  revalidatePath("/cashflow");
  revalidatePath("/cashflow/month");
  revalidatePath("/snapshots");
  return { alreadyClosed: false, toSavings: rollover.toSavings, actualSaved, varianceVsPlan };
}

// ──────────────────────────────────────────────────────────────────────
// Onboarding Concierge (Phase 6)
// ──────────────────────────────────────────────────────────────────────

const capOnboardingSchema = z.object({
  composition: z.enum(profileComposition).default("single"),
  childrenCount: z.coerce.number().int().min(0).default(0),
  carsCount: z.coerce.number().int().min(0).default(0),
  city: z.string().optional().nullable(),
  bufferAmount: z.coerce.number().min(0).default(0),
  savingsTargetMode: z.enum(savingsTargetMode).default("max"),
  savingsTargetAmount: z.coerce.number().min(0).nullable().optional(),
  incomes: z
    .array(
      z.object({
        label: z.string().min(1),
        amount: z.coerce.number().min(0),
        dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
        isVariable: z.boolean().default(false),
        floorAmount: z.coerce.number().min(0).nullable().optional(),
      }),
    )
    .default([]),
  fixedExpenses: z
    .array(
      z.object({
        label: z.string().min(1),
        amount: z.coerce.number().min(0),
        category: z.string().default("subscriptions"),
        dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
      }),
    )
    .default([]),
  envelopes: z
    .array(
      z.object({
        label: z.string().min(1),
        category: z.string().default("other"),
        monthlyAmount: z.coerce.number().min(0),
        cadence: z.enum(envelopeCadence).default("monthly"),
      }),
    )
    .default([]),
});

/**
 * Finalise l'onboarding Concierge : profil, revenus datés, fixes datés et
 * enveloppes en une transaction.
 */
export async function completeCapOnboarding(values: z.infer<typeof capOnboardingSchema>) {
  assertWritable();
  const p = capOnboardingSchema.parse(values);
  const h = await getPrimaryHousehold();
  const now = new Date();

  // Profil (upsert).
  const existing = await db
    .select({ id: schema.financialProfile.id })
    .from(schema.financialProfile)
    .where(eq(schema.financialProfile.householdId, h.id))
    .limit(1);
  const profilePayload = {
    composition: p.composition,
    childrenCount: p.childrenCount,
    carsCount: p.carsCount,
    city: p.city ?? null,
    bufferAmount: p.bufferAmount,
    savingsTargetMode: p.savingsTargetMode,
    savingsTargetAmount: p.savingsTargetMode === "fixed" ? p.savingsTargetAmount ?? 0 : null,
    onboardingCompletedAt: now,
    updatedAt: now,
  };
  if (existing[0]) {
    await db
      .update(schema.financialProfile)
      .set(profilePayload)
      .where(eq(schema.financialProfile.id, existing[0].id));
  } else {
    await db.insert(schema.financialProfile).values({ householdId: h.id, ...profilePayload });
  }

  // Revenus datés.
  for (const i of p.incomes) {
    if (i.amount <= 0 && !(i.isVariable && (i.floorAmount ?? 0) > 0)) continue;
    await db.insert(schema.recurringIncome).values({
      householdId: h.id,
      label: i.label,
      category: "salary",
      amount: i.amount,
      ownership: p.composition === "couple" ? "member" : "member",
      startDate: now,
      dayOfMonth: i.dayOfMonth ?? null,
      isVariable: i.isVariable,
      floorAmount: i.isVariable ? i.floorAmount ?? null : null,
    });
  }

  // Fixes datés.
  for (const e of p.fixedExpenses) {
    if (e.amount <= 0) continue;
    await db.insert(schema.recurringExpense).values({
      householdId: h.id,
      label: e.label,
      category: e.category,
      amount: e.amount,
      ownership: "shared",
      startDate: now,
      dayOfMonth: e.dayOfMonth ?? null,
      frequency: "monthly",
      flowType: "fixed",
      active: true,
      autoConfirm: true,
    });
  }

  // Enveloppes variables.
  for (const env of p.envelopes) {
    if (env.monthlyAmount <= 0) continue;
    await db.insert(schema.budgetEnvelope).values({
      householdId: h.id,
      label: env.label,
      category: env.category,
      monthlyAmount: env.monthlyAmount,
      cadence: env.cadence,
      rolloverPolicy: "to_savings",
      active: true,
    });
  }

  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
  revalidatePath("/expenses");
}
