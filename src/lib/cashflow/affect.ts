import type { TransactionCategory } from "@/lib/transaction-categorizer";
import type { SpendEventRow } from "./assemble";

/**
 * Cash-flow ("Cap") — affectation des transactions bancaires aux enveloppes.
 *
 * Le pont manquant : une transaction `accountCashflow` déjà catégorisée par la
 * cascade (user rule → BCE → regex → fallback) doit consommer l'enveloppe
 * correspondante, EXACTEMENT comme une `confirmSpend` manuelle. On dérive donc
 * des `SpendEventRow` synthétiques au moment de la lecture du dashboard, à
 * partir des transactions vivantes — pas de matérialisation à maintenir, donc
 * idempotent par construction et reflétant instantanément toute recatégorisation.
 *
 * Maths auto-cohérentes : la transaction a déjà fait baisser le solde du compte
 * (`availableBalance`) ; en lui faisant aussi consommer l'enveloppe, l'effet net
 * sur le Safe-to-Spend est nul tant qu'on reste dans le budget — et il ampute
 * l'excédent en cas de dépassement (philosophie Yield-First).
 *
 * Logique pure (aucun accès DB), entièrement testable.
 */

/** Catégorie d'enveloppe = valeur de `expenseCategory` (texte libre en DB). */
export type AffectEnvelope = {
  id: string;
  label: string;
  category: string;
  active: boolean;
  /**
   * Catégories de transaction explicitement absorbées par l'enveloppe (source de
   * vérité du routage). Vide/null → repli sur l'heuristique de libellé.
   */
  txCategories?: TransactionCategory[] | null;
};

/** Transaction bancaire brute, telle que stockée dans `accountCashflow`. */
export type AffectCashflow = {
  /** Montant signé : négatif = argent sorti du compte. */
  amount: number;
  date: Date;
  /** Catégorie résolue (valeur de `transactionCategory`) ou null si non classée. */
  category: string | null;
  /** Renseigné si la transaction est un virement interne → jamais une dépense. */
  transferToAccountId: string | null;
};

/**
 * Correspondance grossière catégorie de transaction → catégorie d'enveloppe.
 * `null` = ce n'est PAS une dépense variable d'enveloppe (revenu, virement,
 * épargne, retrait cash) → on n'en dérive aucune consommation.
 */
const TX_TO_ENVELOPE_CATEGORY: Record<TransactionCategory, string | null> = {
  income_salary: null,
  income_other: null,
  transfer_internal: null,
  savings_invest: null,
  // Le retrait cash sort du solde mais la dépense réelle (espèces) est suivie
  // à la main : on ne l'auto-affecte pas (le solde baisse → STS conservateur).
  cash_withdrawal: null,
  housing: "housing",
  utilities: "utilities",
  telecom_internet: "utilities",
  food_groceries: "food",
  food_restaurant: "food",
  transport: "transport",
  fuel: "transport",
  subscriptions: "subscriptions",
  health: "health",
  leisure: "leisure",
  shopping: "leisure",
  insurance: "insurance",
  tax: "taxes",
  education: "other",
  fees_bank: "other",
  donation_gift: "other",
  other_expense: "other",
  other: "other",
};

/** Minuscule, sans accents — pour matcher les libellés d'enveloppe. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Ensemble des catégories de transaction FINES qu'une enveloppe absorbe, dérivé
 * de sa catégorie + son libellé. Permet de désambiguïser deux enveloppes de même
 * catégorie grossière (ex. « Courses » et « Restaurants », toutes deux `food` —
 * les presets d'onboarding en créent par défaut).
 */
export function envelopeFineCategories(env: AffectEnvelope): Set<TransactionCategory> {
  // Configuration explicite (panier de catégories) → source de vérité.
  if (env.txCategories && env.txCategories.length > 0) {
    return new Set(env.txCategories);
  }
  const label = normalize(env.label);
  switch (env.category) {
    case "food": {
      const groceries = /course|grocer|supermarch|aliment|delhaize|colruyt|carrefour|aldi|lidl|spar/.test(label);
      const resto = /resto|restaurant|midi|lunch|diner|brunch|repas|cantine|uber ?eats|deliveroo|takeaway/.test(label);
      if (groceries && !resto) return new Set(["food_groceries"]);
      if (resto && !groceries) return new Set(["food_restaurant"]);
      return new Set(["food_groceries", "food_restaurant"]);
    }
    case "leisure": {
      const shop = /shop|vetement|fringue|achat|amazon|zalando|mode|deco|cadeau/.test(label);
      const out = /sortie|bar|loisir|cine|concert|soiree|sport|club|verre|resto/.test(label);
      if (shop && !out) return new Set(["shopping"]);
      if (out && !shop) return new Set(["leisure"]);
      return new Set(["leisure", "shopping"]);
    }
    case "utilities":
      return new Set(["utilities", "telecom_internet"]);
    case "transport":
      return new Set(["transport"]);
    case "housing":
      return new Set(["housing"]);
    case "insurance":
      return new Set(["insurance"]);
    case "subscriptions":
      return new Set(["subscriptions"]);
    case "health":
      return new Set(["health"]);
    case "taxes":
      return new Set(["tax"]);
    case "other":
      return new Set(["other_expense", "donation_gift", "education", "fees_bank", "other"]);
    default:
      return new Set();
  }
}

/**
 * Résout l'enveloppe qui doit absorber une transaction de catégorie `txCategory`.
 * Retourne l'id d'enveloppe, ou `null` (→ imputée au coussin).
 *
 *  1. Candidats FINS : enveloppes dont l'ensemble absorbe cette catégorie exacte.
 *     - 1 → elle. - >1 → la plus spécifique (plus petit ensemble), tie-break id.
 *  2. Sinon, repli GROSSIER : enveloppe dont `category` = catégorie cible.
 *  3. Sinon → null (coussin).
 */
export function resolveEnvelope(
  txCategory: TransactionCategory,
  envelopes: AffectEnvelope[],
): string | null {
  const active = envelopes.filter((e) => e.active);

  const fine = active
    .map((e) => ({ e, set: envelopeFineCategories(e) }))
    .filter((x) => x.set.has(txCategory));
  if (fine.length > 0) {
    fine.sort((a, b) => a.set.size - b.set.size || (a.e.id < b.e.id ? -1 : 1));
    return fine[0].e.id;
  }

  const coarse = TX_TO_ENVELOPE_CATEGORY[txCategory];
  if (coarse) {
    const match = active.filter((e) => e.category === coarse).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (match.length > 0) return match[0].id;
  }

  return null;
}

/**
 * Dérive les `SpendEventRow` synthétiques d'un mois à partir des transactions
 * bancaires. Ne retient que les SORTIES (montant < 0), du mois courant, non
 * virements internes, classées en dépense variable d'enveloppe.
 *
 * `fixedCategories` = catégories d'enveloppe (`expenseCategory`) revendiquées par
 * les charges fixes actives du household (échéancier). Une dépense qui retombe sur
 * une de ces catégories sans enveloppe dédiée est IGNORÉE : elle est déjà
 * anticipée dans `remainingFixed` et son débit a déjà baissé le solde — la router
 * vers le coussin la compterait deux fois.
 */
export function deriveSpendEvents(
  cashflows: AffectCashflow[],
  envelopes: AffectEnvelope[],
  fixedCategories: Set<string>,
  today: Date,
): SpendEventRow[] {
  const year = today.getUTCFullYear();
  const month0 = today.getUTCMonth();
  const out: SpendEventRow[] = [];

  for (const c of cashflows) {
    if (c.amount >= 0) continue; // entrée d'argent, pas une dépense
    if (c.transferToAccountId) continue; // virement interne
    if (c.date.getUTCFullYear() !== year || c.date.getUTCMonth() !== month0) continue;
    if (!c.category) continue; // non classée → on ne devine pas (conservateur)

    const cat = c.category as TransactionCategory;
    const target = TX_TO_ENVELOPE_CATEGORY[cat];
    // undefined (catégorie inconnue/legacy) OU null (revenu/virement/épargne/cash) → ignorée.
    if (target == null) continue;

    const envelopeId = resolveEnvelope(cat, envelopes);
    if (envelopeId === null && fixedCategories.has(target)) {
      // Couverte par une charge fixe (échéancier) → ne pas double-compter.
      continue;
    }

    out.push({
      amount: Math.abs(c.amount),
      envelopeId,
      chargedToBuffer: envelopeId === null,
      date: c.date,
    });
  }

  return out;
}
