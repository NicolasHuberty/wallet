import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { matchesCounterparty } from "@/lib/counterparty-match";
import { resolveCategory, type AnalyticsCashflow } from "@/lib/account-analytics";
import type { TransactionCategory } from "@/lib/transaction-categorizer";
import type { EnvelopeCadence, RolloverPolicy, FlowFrequency } from "@/db/schema";

/**
 * Modèle « Poste » unifié — UNE abstraction pour les trois natures de dépense
 * récurrente/ponctuelle, par-dessus les tables existantes (pas de fusion
 * physique) :
 *   - variable : enveloppe étalée (Courses 450€/mois)        → budgetEnvelope
 *   - fixed    : charge datée récurrente (Mutuelle 100€/trim) → recurringExpense
 *   - oneoff   : frais ponctuel (Notaire, travaux)           → oneOffCharge
 *
 * Chaque poste est lié aux transactions par `txCategories` (catégories) et/ou
 * `counterpartyPatterns` (règles de contrepartie). Logique de matching PURE et
 * testable ; `listPostes` lit la base.
 */

export type PosteKind = "variable" | "fixed" | "oneoff";

export type Poste = {
  kind: PosteKind;
  id: string;
  label: string;
  /** Regroupement d'affichage (valeur de `expenseCategory`). */
  category: string;
  /** Montant par période (mensuel pour variable ; par échéance pour fixed ; total pour oneoff). */
  amount: number;
  active: boolean;
  txCategories: string[];
  counterpartyPatterns: string[];
  // variable
  cadence?: EnvelopeCadence;
  rolloverPolicy?: RolloverPolicy;
  occurrencesPerMonth?: number | null;
  // fixed
  frequency?: FlowFrequency;
  dayOfMonth?: number | null;
  // oneoff
  date?: Date | null;
  propertyId?: string | null;
  includeInCostBasis?: boolean;
};

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ─── Matching (PUR) ──────────────────────────────────────────────────

export { matchesCounterparty };

export type PreviewRow = {
  id: string;
  date: Date | string;
  amount: number;
  label: string;
  category: TransactionCategory;
  accountName?: string;
};

export type PostePreview = {
  /** Impact par règle de contrepartie. */
  byPattern: { pattern: string; count: number; total: number }[];
  /** Transactions matchées (par contrepartie OU catégorie), dédupliquées. */
  matched: PreviewRow[];
  totalCount: number;
  totalAmount: number;
};

export type PreviewInput = {
  counterpartyPatterns: string[];
  txCategories: string[];
};

/**
 * Aperçu d'impact : toutes les transactions (dépenses) que les règles + les
 * catégories d'un poste captureraient. Pur, testable.
 */
export function previewPoste<
  T extends AnalyticsCashflow & { id: string; notes: string | null; accountName?: string },
>(rows: T[], input: PreviewInput): PostePreview {
  const cats = new Set(input.txCategories);
  const patterns = input.counterpartyPatterns.map((p) => p.trim()).filter((p) => p.length >= 2);

  const byPattern = patterns.map((pattern) => ({ pattern, count: 0, total: 0 }));
  const matched: PreviewRow[] = [];

  for (const r of rows) {
    if (r.amount >= 0) continue; // on s'intéresse aux dépenses
    const cat = resolveCategory(r);
    const byCat = cats.has(cat);
    let byPat = false;
    for (let i = 0; i < patterns.length; i++) {
      if (matchesCounterparty(r.notes, [patterns[i]])) {
        byPat = true;
        byPattern[i].count++;
        byPattern[i].total += Math.abs(r.amount);
      }
    }
    if (byCat || byPat) {
      matched.push({
        id: r.id,
        date: r.date,
        amount: Math.abs(r.amount),
        label: r.notes ?? "(sans description)",
        category: cat,
        accountName: r.accountName,
      });
    }
  }

  matched.sort((a, b) => b.amount - a.amount);
  return {
    byPattern,
    matched,
    totalCount: matched.length,
    totalAmount: matched.reduce((s, m) => s + m.amount, 0),
  };
}

// ─── Lecture unifiée des postes ──────────────────────────────────────

export async function listPostes(householdId: string): Promise<Poste[]> {
  const [envelopes, recurrents, oneoffs] = await Promise.all([
    db.select().from(schema.budgetEnvelope).where(eq(schema.budgetEnvelope.householdId, householdId)),
    db
      .select()
      .from(schema.recurringExpense)
      .where(
        and(
          eq(schema.recurringExpense.householdId, householdId),
          eq(schema.recurringExpense.flowType, "fixed"),
        ),
      ),
    db.select().from(schema.oneOffCharge).where(eq(schema.oneOffCharge.householdId, householdId)),
  ]);

  const variable: Poste[] = envelopes.map((e) => ({
    kind: "variable",
    id: e.id,
    label: e.label,
    category: e.category,
    amount: e.monthlyAmount,
    active: e.active,
    txCategories: parseJsonArray(e.txCategories),
    counterpartyPatterns: parseJsonArray(e.counterpartyPatterns),
    cadence: e.cadence,
    rolloverPolicy: e.rolloverPolicy,
    occurrencesPerMonth: e.occurrencesPerMonth,
  }));

  const fixed: Poste[] = recurrents.map((r) => ({
    kind: "fixed",
    id: r.id,
    label: r.label,
    category: r.category,
    amount: r.amount,
    active: r.active,
    txCategories: parseJsonArray(r.txCategories),
    counterpartyPatterns: parseJsonArray(r.counterpartyPatterns),
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
  }));

  const oneoff: Poste[] = oneoffs.map((c) => ({
    kind: "oneoff",
    id: c.id,
    label: c.label,
    category: c.category,
    amount: c.amount,
    active: true,
    txCategories: [],
    counterpartyPatterns: [],
    date: c.date,
    propertyId: c.propertyId,
    includeInCostBasis: c.includeInCostBasis,
  }));

  return [...variable, ...fixed, ...oneoff];
}
