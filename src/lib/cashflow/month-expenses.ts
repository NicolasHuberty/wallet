import { resolveCategory, type AnalyticsCashflow } from "@/lib/account-analytics";
import { matchesCounterparty, normalizeCounterparty } from "@/lib/counterparty-match";
import type { TransactionCategory } from "@/lib/transaction-categorizer";
import { resolveEnvelope, TX_TO_ENVELOPE_CATEGORY, type AffectEnvelope } from "./affect";

/**
 * Cash-flow ("Cap") — vue « Dépenses du mois ». Logique PURE (aucun accès DB) :
 * à partir des transactions bancaires du mois + des dépenses saisies à la main,
 * produit une liste unifiée où chaque dépense est rapprochée d'un *type*
 * (catégorie de transaction) et d'une *enveloppe* (via le même moteur de routage
 * que le Safe-to-Spend). Entièrement testable.
 */

/** Transaction bancaire brute (compte courant), telle que lue en base. */
export type MonthRawTx = {
  id: string;
  date: Date;
  /** Montant signé : négatif = sortie. */
  amount: number;
  notes: string | null;
  category: TransactionCategory | null;
  kind?: AnalyticsCashflow["kind"];
  transferToAccountId: string | null;
  accountId: string;
  accountName: string;
};

/** Dépense saisie à la main (espèces), non réconciliée à une transaction. */
export type MonthManualSpend = {
  id: string;
  date: Date;
  amount: number; // positif
  envelopeId: string | null;
  chargedToBuffer: boolean;
  label: string | null;
};

/**
 * Affectation d'une dépense :
 *  - envelope   : routée vers une enveloppe variable
 *  - fixed      : couverte par une charge fixe (échéancier) — pas de la variable
 *  - buffer     : variable non rattachée → coussin / imprévu
 *  - non_spend  : sortie qui n'est pas de la dépense variable (retrait, épargne…)
 */
export type MonthAffectation = "envelope" | "fixed" | "buffer" | "non_spend";

export type MonthTransaction = {
  id: string;
  /** Préfixé `manual:` pour les saisies — sinon = id du `accountCashflow`. */
  source: "bank" | "manual";
  /** ISO (sérialisable client). */
  date: string;
  /** Montant positif (dépense). */
  amount: number;
  label: string;
  accountId: string | null;
  accountName: string | null;
  category: TransactionCategory | null;
  envelopeId: string | null;
  envelopeLabel: string | null;
  affectation: MonthAffectation;
};

export type BuildMonthInput = {
  bank: MonthRawTx[];
  manual: MonthManualSpend[];
  envelopes: AffectEnvelope[];
  /** Métadonnées d'enveloppe (libellé/catégorie) par id, pour l'affichage. */
  envelopeMeta: Record<string, { label: string; category: string }>;
  /** Catégories d'enveloppe revendiquées par les charges fixes actives. */
  fixedCategories: Set<string>;
  /** Contreparties revendiquées par les charges fixes. */
  fixedPatterns: string[];
};

function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Construit la liste unifiée des dépenses du mois avec leur rapprochement
 * (type + enveloppe). Triée du plus récent au plus ancien.
 */
export function buildMonthTransactions(input: BuildMonthInput): MonthTransaction[] {
  const out: MonthTransaction[] = [];

  for (const t of input.bank) {
    if (t.amount >= 0) continue; // entrée d'argent
    if (t.transferToAccountId) continue; // virement interne

    const cat = resolveCategory({
      date: t.date,
      amount: t.amount,
      notes: t.notes,
      category: t.category,
      kind: t.kind,
    });
    const target = TX_TO_ENVELOPE_CATEGORY[cat]; // string | null | undefined

    let envelopeId: string | null = null;
    let affectation: MonthAffectation;
    if (target == null) {
      affectation = "non_spend";
    } else {
      envelopeId = resolveEnvelope(cat, t.notes, input.envelopes);
      if (envelopeId) affectation = "envelope";
      else if (matchesCounterparty(t.notes, input.fixedPatterns) || input.fixedCategories.has(target))
        affectation = "fixed";
      else affectation = "buffer";
    }

    out.push({
      id: t.id,
      source: "bank",
      date: iso(t.date),
      amount: Math.abs(t.amount),
      label: t.notes ?? "(sans description)",
      accountId: t.accountId,
      accountName: t.accountName,
      category: cat,
      envelopeId,
      envelopeLabel: envelopeId ? input.envelopeMeta[envelopeId]?.label ?? null : null,
      affectation,
    });
  }

  for (const m of input.manual) {
    const toBuffer = m.chargedToBuffer || !m.envelopeId;
    const envelopeId = toBuffer ? null : m.envelopeId;
    out.push({
      id: `manual:${m.id}`,
      source: "manual",
      date: iso(m.date),
      amount: m.amount,
      label: m.label ?? "Dépense en espèces",
      accountId: null,
      accountName: null,
      category: null,
      envelopeId,
      envelopeLabel: envelopeId ? input.envelopeMeta[envelopeId]?.label ?? null : null,
      affectation: toBuffer ? "buffer" : "envelope",
    });
  }

  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/**
 * Dérive un motif de contrepartie « raisonnable » d'une description de
 * transaction — sert au rapprochement 1-clic vers une enveloppe (on ajoute ce
 * motif aux règles de l'enveloppe). On garde la tête de la description (avant
 * IBAN / refs / double-espace) et on retient les 2 premiers tokens normalisés
 * pour rester spécifique tout en captant les paiements similaires.
 */
export function merchantPattern(notes: string | null): string | null {
  if (!notes) return null;
  const head = notes.split(/\s{2,}|—|\bBE\d{2}[A-Z0-9]+\b|\bref\.?:/i)[0] ?? notes;
  const norm = normalizeCounterparty(head);
  if (!norm) return null;
  const tokens = norm.split(" ").filter(Boolean).slice(0, 2).join(" ");
  return tokens.length >= 3 ? tokens : norm.length >= 3 ? norm.slice(0, 24) : null;
}

// ─── Agrégations de suivi (jour / semaine / mois) ────────────────────

export type TrackingBucket = { key: string; label: string; spend: number; count: number };

/** Lundi 00:00 UTC de la semaine contenant `date`. */
function startOfWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

/** Dépense par jour du mois sélectionné. */
export function bucketByDay(txs: MonthTransaction[]): TrackingBucket[] {
  const map = new Map<string, TrackingBucket>();
  for (const t of txs) {
    const d = new Date(t.date);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${day}`;
    const b = map.get(key) ?? { key, label: day, spend: 0, count: 0 };
    b.spend += t.amount;
    b.count++;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Dépense par semaine ISO (lundi) du mois sélectionné. */
export function bucketByWeek(txs: MonthTransaction[]): TrackingBucket[] {
  const map = new Map<string, TrackingBucket & { ord: number }>();
  for (const t of txs) {
    const ws = startOfWeekUTC(new Date(t.date));
    const key = ws.toISOString().slice(0, 10);
    const b =
      map.get(key) ??
      ({ key, label: `Sem. du ${String(ws.getUTCDate()).padStart(2, "0")}`, spend: 0, count: 0, ord: ws.getTime() });
    b.spend += t.amount;
    b.count++;
    map.set(key, b);
  }
  return [...map.values()]
    .sort((a, b) => a.ord - b.ord)
    .map(({ key, label, spend, count }) => ({ key, label, spend, count }));
}
