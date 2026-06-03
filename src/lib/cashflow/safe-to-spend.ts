import { computePacing, pacingColor, type PacingColor } from "./pacing";

/**
 * Cash-flow ("Cap") — la métrique reine : Safe-to-Spend.
 *
 * Montant réellement libre à un instant T, après déduction VIRTUELLE de tous
 * les engagements datés restants, des enveloppes non consommées, de l'épargne
 * engagée et du coussin. Logique pure, testable.
 *
 *   SafeToSpend = soldeDisponible
 *               + revenusRestants
 *               − fixesDatésRestants
 *               − variablesNonConsommées
 *               − épargneEngagée
 *               − coussinNonEntamé
 */

export type SafeToSpendInput = {
  /** Solde de vie courante réellement accessible. */
  availableBalance: number;
  /** Revenus datés encore à venir ce mois (plancher si variable). */
  remainingIncome: number;
  /** Dépenses fixes datées encore à venir, non encore passées. */
  remainingFixed: number;
  /** Σ sur enveloppes de max(0, planifié − consommé). */
  variableRemaining: number;
  /** DCA + objectif d'épargne du mois. */
  committedSavings: number;
  /** Coussin non encore entamé. */
  bufferRemaining: number;
  /** Jour courant (1-based). */
  dayOfMonth: number;
  /** Nombre de jours dans le mois. */
  daysInMonth: number;
  /**
   * Optionnel : budget discrétionnaire total planifié (variable + coussin) et
   * déjà consommé, pour dériver une couleur fine via le moteur de pacing.
   */
  discretionaryPlanned?: number;
  discretionaryConsumed?: number;
};

export type SafeToSpendResult = {
  /** Montant libre jusqu'à la fin du mois (peut être négatif). */
  safeToSpend: number;
  /** Budget journalier jusqu'à la fin du mois (jamais négatif). */
  budgetPerDay: number;
  /** Jours restants, jour courant inclus (≥ 1). */
  daysRemaining: number;
  /**
   * Solde projeté en fin de mois si le plan se déroule (le coussin non dépensé
   * reste sur le compte, donc non soustrait ici).
   */
  projectedEndBalance: number;
  /** Couleur d'ambiance globale pour le héros du dashboard. */
  color: PacingColor;
};

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const daysRemaining = Math.max(1, input.daysInMonth - input.dayOfMonth + 1);

  // On dépense depuis ce qu'on a DÉJÀ (le solde). Les revenus encore à venir
  // ne s'ajoutent pas : quand ils tombent, ils remplissent simplement le solde.
  // Les ajouter reviendrait à compter le salaire deux fois (il est déjà sur le
  // compte + il « arrive »).
  const safeToSpend =
    input.availableBalance -
    input.remainingFixed -
    input.variableRemaining -
    input.committedSavings -
    input.bufferRemaining;

  const budgetPerDay = Math.max(0, safeToSpend) / daysRemaining;

  // Le solde de fin de mois projeté, lui, intègre les revenus à venir (c'est
  // une projection de ce que sera le compte à la fin du mois). Le coussin non
  // dépensé reste sur le compte → non soustrait ici.
  const projectedEndBalance =
    input.availableBalance +
    input.remainingIncome -
    input.remainingFixed -
    input.variableRemaining -
    input.committedSavings;

  const color = resolveColor(input, safeToSpend);

  return { safeToSpend, budgetPerDay, daysRemaining, projectedEndBalance, color };
}

function resolveColor(input: SafeToSpendInput, safeToSpend: number): PacingColor {
  // Un Safe-to-Spend négatif est toujours rouge, quel que soit le pacing.
  if (safeToSpend < 0) return "red";

  // Couleur fine via le pacing de l'agrégat discrétionnaire, si fourni.
  if (
    input.discretionaryPlanned !== undefined &&
    input.discretionaryConsumed !== undefined
  ) {
    // Jour 1 : on laisse "neutral" (le mois démarre).
    if (input.dayOfMonth <= 1) return "neutral";
    const pacing = computePacing({
      planned: input.discretionaryPlanned,
      consumed: input.discretionaryConsumed,
      day: input.dayOfMonth,
      totalDays: input.daysInMonth,
    });
    const c = pacingColor(pacing.state);
    return c === "neutral" ? "green" : c;
  }

  return input.dayOfMonth <= 1 ? "neutral" : "green";
}
