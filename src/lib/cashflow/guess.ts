/**
 * Cash-flow ("Cap") — devinette de l'enveloppe la plus probable pour une
 * dépense confirmée manuellement. On ne dispose pas de libellé bancaire ici
 * (saisie au doigt), donc on s'appuie sur le contexte temporel + l'historique
 * de consommation. Logique pure, testable.
 */

export type GuessEnvelope = {
  id: string;
  category: string;
  /** Montant déjà consommé ce mois (pour départager à contexte égal). */
  consumed?: number;
};

/** Catégorie privilégiée selon le moment de la semaine / journée. */
export function contextualCategory(now: Date): string | null {
  const day = now.getUTCDay(); // 0 = dimanche, 6 = samedi
  const hour = now.getUTCHours();
  const weekend = day === 5 || day === 6 || day === 0;
  // Soirée (sortie) : vendredi/samedi/dimanche en soirée → loisirs.
  if (weekend && (hour >= 18 || hour < 4)) return "leisure";
  // Midi en semaine → restauration / food.
  if (!weekend && hour >= 11 && hour <= 14) return "food";
  return null;
}

/**
 * Choisit l'enveloppe par défaut à pré-sélectionner :
 *  1. celle dont la catégorie correspond au contexte temporel,
 *  2. sinon la plus consommée ce mois (habitude dominante),
 *  3. sinon la première.
 * Renvoie `null` si aucune enveloppe.
 */
export function guessEnvelope(
  envelopes: GuessEnvelope[],
  now: Date,
): string | null {
  if (envelopes.length === 0) return null;

  const cat = contextualCategory(now);
  if (cat) {
    const match = envelopes.find((e) => e.category === cat);
    if (match) return match.id;
  }

  const mostConsumed = [...envelopes].sort(
    (a, b) => (b.consumed ?? 0) - (a.consumed ?? 0),
  )[0];
  if ((mostConsumed.consumed ?? 0) > 0) return mostConsumed.id;

  return envelopes[0].id;
}
