/**
 * Cash-flow ("Cap") — moteur de pacing (vélocité de consommation).
 *
 * Insight central : la couleur d'une jauge ne dépend pas de son remplissage
 * absolu, mais de son AVANCE sur le calendrier. Une enveloppe consommée à 60 %
 * au jour 10/30 (33 % du mois) brûle trop vite ; la même à 30 % est dans le
 * rythme. Logique pure, testable.
 */

export type PacingState =
  | "neutral" // pas de budget planifié
  | "on_track" // dans le rythme
  | "slightly_fast" // un peu rapide
  | "fast" // en avance, brûle vite
  | "over"; // dépassé

export type PacingInput = {
  /** Montant planifié pour la période (mois ou semaine). */
  planned: number;
  /** Montant déjà consommé. */
  consumed: number;
  /** Jour courant (1-based) dans la période. */
  day: number;
  /** Nombre total de jours de la période. */
  totalDays: number;
};

export type PacingResult = {
  /** Fraction de temps écoulée (0..1). */
  ratioTime: number;
  /** Fraction de budget consommée (0..1+). */
  ratioConsumed: number;
  /** Vélocité = ratioConsumed / ratioTime. > 1 = trop rapide. */
  velocity: number;
  state: PacingState;
  /** Reste disponible dans l'enveloppe (jamais négatif). */
  remaining: number;
  /** Dépassement éventuel (consumed - planned, jamais négatif). */
  overspent: number;
};

const SLIGHTLY_FAST = 1.0;
const FAST = 1.3;

/** Calcule l'état de pacing d'une enveloppe / d'un agrégat. */
export function computePacing(input: PacingInput): PacingResult {
  const planned = Math.max(0, input.planned);
  const consumed = Math.max(0, input.consumed);
  const totalDays = Math.max(1, input.totalDays);
  const day = Math.min(Math.max(input.day, 0), totalDays);

  const ratioTime = day / totalDays;
  const ratioConsumed = planned > 0 ? consumed / planned : 0;
  const velocity = ratioTime > 0 ? ratioConsumed / ratioTime : ratioConsumed > 0 ? Infinity : 0;

  const remaining = Math.max(0, planned - consumed);
  const overspent = Math.max(0, consumed - planned);

  let state: PacingState;
  if (planned <= 0) {
    state = "neutral";
  } else if (ratioConsumed >= 1) {
    state = "over";
  } else if (velocity <= SLIGHTLY_FAST) {
    state = "on_track";
  } else if (velocity <= FAST) {
    state = "slightly_fast";
  } else {
    state = "fast";
  }

  return { ratioTime, ratioConsumed, velocity, state, remaining, overspent };
}

/** Couleur sémantique dérivée d'un état de pacing (pour l'UI). */
export type PacingColor = "neutral" | "green" | "yellow" | "orange" | "red";

export function pacingColor(state: PacingState): PacingColor {
  switch (state) {
    case "neutral":
      return "neutral";
    case "on_track":
      return "green";
    case "slightly_fast":
      return "yellow";
    case "fast":
      return "orange";
    case "over":
      return "red";
  }
}
