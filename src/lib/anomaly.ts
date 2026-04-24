/**
 * Détection d'anomalies de dépenses (pure logic, no DB).
 *
 * Compare le total mensuel d'une catégorie à la moyenne glissante des N mois
 * précédents. Au-delà d'un seuil de déviation, on flagge le mois.
 */

export type CategoryMonth = {
  /** Clé catégorie (ex. "notary", "maintenance"). */
  category: string;
  /** Mois au format ISO court "YYYY-MM". */
  month: string;
  /** Somme des dépenses de la catégorie pour ce mois (en EUR). */
  total: number;
};

export type Anomaly = {
  category: string;
  month: string;
  /** Total réellement observé ce mois-ci. */
  total: number;
  /** Moyenne des N mois précédents (valeur "attendue"). */
  expected: number;
  /**
   * Déviation relative signée : (total - expected) / expected.
   * Positive = inflation, négative = sous-dépense.
   */
  deviation: number;
};

/**
 * Parcours l'historique catégorie par catégorie et renvoie les mois dont le
 * total dévie de plus que `threshold` de la moyenne glissante des
 * `windowMonths` mois précédents.
 *
 * Règles :
 * - La moyenne doit être calculée sur au moins 3 mois de données (évite de
 *   flagger les premiers mois d'une catégorie).
 * - Un mois à 0 alors que la moyenne précédente était > 0 est considéré
 *   comme une déviation de -100% (flaggé comme informationnel).
 * - On exclut le mois courant du calcul de la moyenne.
 * - Les résultats sont triés par amplitude absolue de la déviation
 *   (déviation la plus marquée en premier).
 */
export function detectAnomalies(
  history: CategoryMonth[],
  threshold = 0.2,
  windowMonths = 6,
): Anomaly[] {
  if (!history.length) return [];

  const byCategory = new Map<string, CategoryMonth[]>();
  for (const row of history) {
    const arr = byCategory.get(row.category) ?? [];
    arr.push(row);
    byCategory.set(row.category, arr);
  }

  const anomalies: Anomaly[] = [];

  for (const [category, rows] of byCategory) {
    // Trie chronologique strict par clé "YYYY-MM"
    const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const windowStart = Math.max(0, i - windowMonths);
      const window = sorted.slice(windowStart, i);

      // Il faut au moins 3 mois de données pour considérer une moyenne fiable.
      if (window.length < 3) continue;

      const sum = window.reduce((s, r) => s + r.total, 0);
      const expected = sum / window.length;

      // Pas de référence : si la moyenne est nulle et le mois aussi, rien à dire.
      if (expected === 0 && current.total === 0) continue;

      // Moyenne nulle mais dépense ce mois-ci : impossible de calculer un ratio,
      // on considère cela comme une apparition soudaine — toujours flaggée.
      if (expected === 0) {
        anomalies.push({
          category,
          month: current.month,
          total: current.total,
          expected,
          deviation: Number.POSITIVE_INFINITY,
        });
        continue;
      }

      const deviation = (current.total - expected) / expected;
      if (Math.abs(deviation) > threshold) {
        anomalies.push({
          category,
          month: current.month,
          total: current.total,
          expected,
          deviation,
        });
      }
    }
  }

  return anomalies.sort((a, b) => {
    const da = Number.isFinite(a.deviation) ? Math.abs(a.deviation) : Number.POSITIVE_INFINITY;
    const db = Number.isFinite(b.deviation) ? Math.abs(b.deviation) : Number.POSITIVE_INFINITY;
    return db - da;
  });
}

/**
 * Agrège une liste de frais (date + catégorie + montant) en `CategoryMonth`.
 * Pure utility pour préparer l'input de `detectAnomalies`.
 */
export function aggregateByCategoryMonth(
  charges: { date: Date; category: string; amount: number }[],
): CategoryMonth[] {
  const map = new Map<string, number>();
  for (const c of charges) {
    const d = c.date instanceof Date ? c.date : new Date(c.date);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const key = `${c.category}::${month}`;
    map.set(key, (map.get(key) ?? 0) + c.amount);
  }
  const out: CategoryMonth[] = [];
  for (const [key, total] of map) {
    const [category, month] = key.split("::");
    out.push({ category, month, total });
  }
  return out;
}
