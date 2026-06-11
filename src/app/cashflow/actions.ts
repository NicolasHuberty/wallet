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
  flowFrequency,
} from "@/db/schema";
import {
  getCashflowDashboard,
  getBudgetEnvelopes,
  getSpendEventsThisMonth,
} from "@/lib/cashflow/data";
import { computeRollover, type RolloverEnvelope } from "@/lib/cashflow/rollover";
import { recomputeSnapshot } from "@/lib/snapshots";
import { transactionCategory } from "@/lib/transaction-categorizer";
import { merchantPattern } from "@/lib/cashflow/month-expenses";
import { normalizeCounterparty } from "@/lib/counterparty-match";

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
// Rapprochement des dépenses du mois (vue « Dépenses du mois »)
// ──────────────────────────────────────────────────────────────────────

/** Vérifie qu'une transaction bancaire appartient au household ; renvoie ses infos. */
async function ownedCashflow(householdId: string, cashflowId: string) {
  const [row] = await db
    .select({
      id: schema.accountCashflow.id,
      accountId: schema.accountCashflow.accountId,
      notes: schema.accountCashflow.notes,
      householdId: schema.account.householdId,
    })
    .from(schema.accountCashflow)
    .innerJoin(schema.account, eq(schema.accountCashflow.accountId, schema.account.id))
    .where(eq(schema.accountCashflow.id, cashflowId));
  if (!row || row.householdId !== householdId) throw new Error("Mouvement introuvable");
  return row;
}

const setTxCategorySchema = z.object({
  cashflowId: z.string().min(1),
  category: z.enum(transactionCategory),
});

/** Rapprochement vers un *type* : (re)catégorise une transaction du mois. */
export async function setTransactionCategory(values: z.infer<typeof setTxCategorySchema>) {
  assertWritable();
  const p = setTxCategorySchema.parse(values);
  const h = await getPrimaryHousehold();
  const row = await ownedCashflow(h.id, p.cashflowId);
  await db
    .update(schema.accountCashflow)
    .set({ category: p.category, categorySource: "user", updatedAt: new Date() })
    .where(eq(schema.accountCashflow.id, p.cashflowId));
  revalidatePath("/cashflow/expenses");
  revalidatePath("/cashflow");
  revalidatePath(`/accounts/${row.accountId}`);
}

const assignEnvSchema = z.object({
  cashflowId: z.string().min(1),
  envelopeId: z.string().min(1),
});

/**
 * Ajoute un motif de contrepartie aux règles d'une enveloppe (dédup par forme
 * normalisée). Le moteur de routage (partagé avec le Safe-to-Spend) impute alors
 * les dépenses dont le libellé contient ce motif à cette enveloppe.
 */
async function appendPatternToEnvelope(householdId: string, envelopeId: string, pattern: string) {
  const [env] = await db
    .select({ id: schema.budgetEnvelope.id, patterns: schema.budgetEnvelope.counterpartyPatterns })
    .from(schema.budgetEnvelope)
    .where(
      and(eq(schema.budgetEnvelope.id, envelopeId), eq(schema.budgetEnvelope.householdId, householdId)),
    )
    .limit(1);
  if (!env) throw new Error("Enveloppe introuvable");

  let existing: string[] = [];
  if (env.patterns) {
    try {
      const v = JSON.parse(env.patterns);
      if (Array.isArray(v)) existing = v.filter((x) => typeof x === "string");
    } catch {
      existing = [];
    }
  }
  const normalized = normalizeCounterparty(pattern);
  const already = existing.some((x) => normalizeCounterparty(x) === normalized);
  const next = already ? existing : [...existing, pattern];

  await db
    .update(schema.budgetEnvelope)
    .set({ counterpartyPatterns: JSON.stringify(next), updatedAt: new Date() })
    .where(eq(schema.budgetEnvelope.id, envelopeId));

  revalidatePath("/cashflow/expenses");
  revalidatePath("/cashflow");
  revalidatePath(`/cashflow/envelopes/${envelopeId}`);
}

/**
 * Rapprochement *rapide* vers une enveloppe : motif déduit automatiquement de la
 * transaction (les 2 premiers tokens du marchand).
 */
export async function assignTransactionToEnvelope(values: z.infer<typeof assignEnvSchema>) {
  assertWritable();
  const p = assignEnvSchema.parse(values);
  const h = await getPrimaryHousehold();
  const row = await ownedCashflow(h.id, p.cashflowId);

  const pattern = merchantPattern(row.notes);
  if (!pattern) throw new Error("Description trop courte pour créer une règle.");

  await appendPatternToEnvelope(h.id, p.envelopeId, pattern);
  return { pattern };
}

const addRuleSchema = z.object({
  envelopeId: z.string().min(1),
  pattern: z.string().trim().min(2, "Motif trop court (2 caractères min)."),
});

/**
 * Crée une règle *personnalisée* : l'utilisateur définit lui-même le motif
 * (texte recherché dans le libellé, insensible casse/accents) à lier à une
 * enveloppe. Toutes les transactions correspondantes — présentes et futures —
 * y seront automatiquement imputées.
 */
export async function addEnvelopeRule(values: z.infer<typeof addRuleSchema>) {
  assertWritable();
  const p = addRuleSchema.parse(values);
  const h = await getPrimaryHousehold();
  await appendPatternToEnvelope(h.id, p.envelopeId, p.pattern.trim());
  return { pattern: p.pattern.trim() };
}

// ──────────────────────────────────────────────────────────────────────
// Configuration : profil financier + enveloppes
// ──────────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  bufferAmount: z.coerce.number().min(0).default(0),
  savingsTargetMode: z.enum(savingsTargetMode).default("max"),
  savingsTargetAmount: z.coerce.number().min(0).nullable().optional(),
  defaultRolloverPolicy: z.enum(rolloverPolicy).default("to_savings"),
  spendingAccountId: z.string().nullable().optional(),
});

/** Crée ou met à jour le profil financier (coussin, objectif d'épargne). */
export async function saveFinancialProfile(values: z.infer<typeof profileSchema>) {
  assertWritable();
  const p = profileSchema.parse(values);
  const h = await getPrimaryHousehold();

  // Vérifie que le compte de vie courante appartient bien au household.
  let spendingAccountId: string | null = null;
  if (p.spendingAccountId) {
    const acc = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.id, p.spendingAccountId), eq(schema.account.householdId, h.id)))
      .limit(1);
    spendingAccountId = acc[0]?.id ?? null;
  }

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
    spendingAccountId,
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
// Échéancier : charges fixes datées (récurrence + date)
// ──────────────────────────────────────────────────────────────────────

const fixedChargeSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  category: z.string().min(1).default("subscriptions"),
  amount: z.coerce.number().min(0),
  frequency: z.enum(flowFrequency).default("monthly"),
  firstDate: z.string().optional().nullable(), // ISO yyyy-mm-dd
});

/** Crée ou met à jour une charge fixe datée (échéancier). */
export async function saveFixedCharge(values: z.infer<typeof fixedChargeSchema>) {
  assertWritable();
  const p = fixedChargeSchema.parse(values);
  const h = await getPrimaryHousehold();
  const anchor = p.firstDate ? new Date(p.firstDate) : new Date();

  const payload = {
    label: p.label,
    category: p.category,
    amount: p.amount,
    frequency: p.frequency,
    flowType: "fixed" as const,
    dayOfMonth: p.firstDate ? anchor.getUTCDate() : null,
    startDate: anchor,
    active: true,
    autoConfirm: true,
    updatedAt: new Date(),
  };

  if (p.id) {
    await db
      .update(schema.recurringExpense)
      .set(payload)
      .where(
        and(
          eq(schema.recurringExpense.id, p.id),
          eq(schema.recurringExpense.householdId, h.id),
        ),
      );
  } else {
    await db
      .insert(schema.recurringExpense)
      .values({ householdId: h.id, ownership: "shared", ...payload });
  }
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
  revalidatePath("/expenses");
}

const deleteFixedChargeSchema = z.object({ id: z.string() });

/** Supprime une charge fixe. */
export async function deleteFixedCharge(values: z.infer<typeof deleteFixedChargeSchema>) {
  assertWritable();
  const p = deleteFixedChargeSchema.parse(values);
  const h = await getPrimaryHousehold();
  await db
    .delete(schema.recurringExpense)
    .where(
      and(eq(schema.recurringExpense.id, p.id), eq(schema.recurringExpense.householdId, h.id)),
    );
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
  revalidatePath("/expenses");
}

// ──────────────────────────────────────────────────────────────────────
// Sources de revenus (gestion directe dans Cap)
// ──────────────────────────────────────────────────────────────────────

const incomeSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  amount: z.coerce.number().min(0),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  isVariable: z.boolean().default(false),
  floorAmount: z.coerce.number().min(0).nullable().optional(),
});

/** Crée ou met à jour une source de revenu. */
export async function saveIncomeSource(values: z.infer<typeof incomeSchema>) {
  assertWritable();
  const p = incomeSchema.parse(values);
  const h = await getPrimaryHousehold();

  const payload = {
    label: p.label,
    amount: p.amount,
    dayOfMonth: p.dayOfMonth ?? null,
    isVariable: p.isVariable,
    floorAmount: p.isVariable ? p.floorAmount ?? null : null,
    updatedAt: new Date(),
  };

  if (p.id) {
    await db
      .update(schema.recurringIncome)
      .set(payload)
      .where(
        and(
          eq(schema.recurringIncome.id, p.id),
          eq(schema.recurringIncome.householdId, h.id),
        ),
      );
  } else {
    await db.insert(schema.recurringIncome).values({
      householdId: h.id,
      category: "salary",
      ownership: "member",
      startDate: new Date(),
      ...payload,
    });
  }
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
  revalidatePath("/expenses");
}

const deleteIncomeSchema = z.object({ id: z.string() });

/** Supprime une source de revenu (ex. doublon). */
export async function deleteIncomeSource(values: z.infer<typeof deleteIncomeSchema>) {
  assertWritable();
  const p = deleteIncomeSchema.parse(values);
  const h = await getPrimaryHousehold();
  await db
    .delete(schema.recurringIncome)
    .where(
      and(eq(schema.recurringIncome.id, p.id), eq(schema.recurringIncome.householdId, h.id)),
    );
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/setup");
  revalidatePath("/expenses");
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
        frequency: z.enum(flowFrequency).default("monthly"),
        // Date de la prochaine/première échéance (ISO yyyy-mm-dd). Sert d'ancre
        // pour la récurrence et fixe le jour du mois.
        firstDate: z.string().optional().nullable(),
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

  // Fixes datés (échéancier : récurrence + ancre choisies par l'utilisateur).
  for (const e of p.fixedExpenses) {
    if (e.amount <= 0) continue;
    const anchor = e.firstDate ? new Date(e.firstDate) : now;
    await db.insert(schema.recurringExpense).values({
      householdId: h.id,
      label: e.label,
      category: e.category,
      amount: e.amount,
      ownership: "shared",
      startDate: anchor,
      dayOfMonth: e.firstDate ? anchor.getUTCDate() : null,
      frequency: e.frequency,
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
