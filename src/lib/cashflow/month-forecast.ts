/**
 * Cash-flow ("Cap") — prévision probabiliste du solde de fin de mois.
 *
 * Les fixes datés et revenus sont déterministes ; l'incertitude vient des
 * dépenses variables restantes (les « 3 sorties bar aléatoires »). On simule
 * la dépense discrétionnaire restante comme une variable aléatoire et on en
 * tire une fourchette (p10 / p50 / p90) du solde de fin de mois. Logique pure,
 * testable, RNG seedé (reproductible).
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type ForecastInput = {
  /** Solde de fin de mois si le plan se déroule exactement (déterministe). */
  projectedEndBalance: number;
  /** Dépense discrétionnaire restante incertaine (variable + coussin restants). */
  uncertainRemaining: number;
  /** Coefficient de variation de la dépense discrétionnaire (défaut 0.3). */
  volatility?: number;
  iterations?: number;
  seed?: number;
};

export type ForecastBand = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function forecastEndOfMonth(input: ForecastInput): ForecastBand {
  const iterations = input.iterations ?? 2000;
  const volatility = input.volatility ?? 0.3;
  const mean = Math.max(0, input.uncertainRemaining);

  // Cas dégénéré : rien d'incertain → la fourchette se réduit au déterministe.
  if (mean <= 0) {
    const v = input.projectedEndBalance;
    return { p10: v, p50: v, p90: v, mean: v };
  }

  const rand = mulberry32(input.seed ?? 0xc0ffee);
  const sd = volatility * mean;
  const balances: number[] = new Array(iterations);
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    const spend = Math.max(0, mean + gaussian(rand) * sd);
    // Si on dépense moins que prévu, le solde monte ; plus, il baisse.
    const balance = input.projectedEndBalance + (mean - spend);
    balances[i] = balance;
    sum += balance;
  }
  balances.sort((a, b) => a - b);

  return {
    // p10 = scénario pessimiste (on a beaucoup dépensé) → bas de fourchette.
    p10: percentile(balances, 10),
    p50: percentile(balances, 50),
    p90: percentile(balances, 90),
    mean: sum / iterations,
  };
}
