import type { RolloverPolicy } from "@/db/schema";

/**
 * Cash-flow ("Cap") — débordement (rollover).
 *
 * En fin de période, l'argent non dépensé d'une enveloppe « déborde » selon sa
 * politique : vers l'épargne, reporté sur la période suivante, ou perdu (reset).
 * Logique pure, testable.
 */

export type RolloverEnvelope = {
  id: string;
  /** Montant planifié pour la période. */
  planned: number;
  /** Montant réellement consommé. */
  consumed: number;
  policy: RolloverPolicy;
};

export type RolloverResult = {
  /** Total qui part vers l'épargne / l'investissement. */
  toSavings: number;
  /** Report par enveloppe (politique `accumulate`) : id → montant reporté. */
  carryOver: Record<string, number>;
  /** Surplus perdu (politique `reset`) — informatif. */
  forfeited: number;
};

/** Surplus d'une enveloppe (jamais négatif). */
function surplus(env: RolloverEnvelope): number {
  return Math.max(0, env.planned - env.consumed);
}

/** Calcule le débordement agrégé d'un ensemble d'enveloppes. */
export function computeRollover(envelopes: RolloverEnvelope[]): RolloverResult {
  let toSavings = 0;
  let forfeited = 0;
  const carryOver: Record<string, number> = {};

  for (const env of envelopes) {
    const s = surplus(env);
    if (s <= 0) continue;
    switch (env.policy) {
      case "to_savings":
        toSavings += s;
        break;
      case "accumulate":
        carryOver[env.id] = s;
        break;
      case "reset":
        forfeited += s;
        break;
    }
  }

  return { toSavings, carryOver, forfeited };
}
