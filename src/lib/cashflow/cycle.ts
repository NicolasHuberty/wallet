import { sumOccurrences, type DatedFlow } from "./occurrences";

/**
 * Cash-flow ("Cap") — construction du plan d'un cycle mensuel.
 *
 * À l'ouverture d'un `monthCycle`, on fige le plan : revenus attendus, fixes
 * datés attendus, enveloppes variables, objectif d'épargne et coussin. Ce plan
 * sert ensuite de référence pour comparer plan vs réel à la clôture. Logique
 * pure, testable.
 */

export type PlanEnvelope = {
  monthlyAmount: number;
  active?: boolean;
  /** Report de la période précédente (politique `accumulate`). */
  carryOver?: number;
};

export type BuildCyclePlanInput = {
  /** Revenus récurrents. `amount` doit déjà être l'effectif (plancher si variable). */
  incomes: DatedFlow[];
  /** Dépenses fixes datées. */
  fixedExpenses: DatedFlow[];
  envelopes: PlanEnvelope[];
  savingsTarget: number;
  bufferAmount: number;
  openingBalance: number;
  year: number;
  /** Index de mois 0..11. */
  month0: number;
};

export type CyclePlan = {
  plannedIncome: number;
  plannedFixed: number;
  plannedVariable: number;
  savingsTarget: number;
  bufferAmount: number;
  openingBalance: number;
  /** Solde projeté en fin de mois si le plan se déroule exactement. */
  projectedEndBalance: number;
};

export function buildCyclePlan(input: BuildCyclePlanInput): CyclePlan {
  const { year, month0 } = input;

  const plannedIncome = input.incomes.reduce(
    (s, f) => s + sumOccurrences(f, year, month0),
    0,
  );
  const plannedFixed = input.fixedExpenses.reduce(
    (s, f) => s + sumOccurrences(f, year, month0),
    0,
  );
  const plannedVariable = input.envelopes
    .filter((e) => e.active !== false)
    .reduce((s, e) => s + e.monthlyAmount + (e.carryOver ?? 0), 0);

  const projectedEndBalance =
    input.openingBalance +
    plannedIncome -
    plannedFixed -
    plannedVariable -
    input.savingsTarget;

  return {
    plannedIncome,
    plannedFixed,
    plannedVariable,
    savingsTarget: input.savingsTarget,
    bufferAmount: input.bufferAmount,
    openingBalance: input.openingBalance,
    projectedEndBalance,
  };
}

/**
 * Capacité d'épargne réelle affichée à la fin de l'onboarding :
 *   revenus − fixes − variables − coussin.
 */
export function computeSavingsCapacity(input: {
  monthlyIncome: number;
  monthlyFixed: number;
  monthlyVariable: number;
  bufferAmount: number;
}): number {
  return (
    input.monthlyIncome - input.monthlyFixed - input.monthlyVariable - input.bufferAmount
  );
}
