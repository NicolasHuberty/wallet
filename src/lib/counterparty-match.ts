/**
 * Matching de contrepartie — PUR (aucune dépendance DB), partagé par l'aperçu
 * d'impact des règles (postes) et le routage transaction → poste (moteur Cap),
 * pour que la prévisualisation et le comportement réel soient identiques.
 */

/** Minuscule, sans accents, alphanumérique compacté. */
export function normalizeCounterparty(s: string | null): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** La description matche-t-elle au moins un motif (sous-chaîne normalisée) ? */
export function matchesCounterparty(notes: string | null, patterns: string[]): boolean {
  if (!notes || patterns.length === 0) return false;
  const n = normalizeCounterparty(notes);
  return patterns.some((p) => {
    const pat = normalizeCounterparty(p);
    return pat.length >= 2 && n.includes(pat);
  });
}
