import type { FlowFrequency } from "@/db/schema";

/**
 * Cash-flow ("Cap") — dépliage des flux datés en occurrences concrètes d'un
 * mois donné. Logique pure (aucun accès DB), entièrement testable.
 *
 * Un flux récurrent (`recurringExpense` / `recurringIncome`) est défini par un
 * `dayOfMonth`, une `frequency` et une date d'ancrage (`anchorDate`, en
 * pratique le `startDate`). On veut, pour un mois cible, la liste des dates
 * concrètes où le flux survient, avec leur montant.
 */

export type DatedFlow = {
  /** Montant unitaire de l'occurrence (positif). */
  amount: number;
  /** Jour du mois (1..31). Clampé au dernier jour pour les mois courts. */
  dayOfMonth: number | null;
  frequency: FlowFrequency;
  /** Date d'ancrage (= startDate). Sert d'origine pour quarterly/yearly/biweekly. */
  anchorDate?: Date | null;
  /** Fin de validité (incluse). Au-delà, le flux ne survient plus. */
  endDate?: Date | null;
  /** Flux en pause → aucune occurrence. */
  active?: boolean;
};

export type DatedOccurrence = {
  /** Jour du mois (1..31). */
  day: number;
  /** Date complète (UTC, midi pour éviter les bascules de fuseau). */
  date: Date;
  amount: number;
};

/** Nombre de jours dans le mois (month0 = index 0..11). */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Clampe un jour au dernier jour du mois (ex. 31 → 30 en avril, 28/29 en fév). */
export function clampDay(day: number, year: number, month0: number): number {
  const last = daysInMonth(year, month0);
  if (day < 1) return 1;
  return Math.min(day, last);
}

/** Construit une date UTC à midi (stable vis-à-vis des fuseaux/fr-BE). */
function utcNoon(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day, 12, 0, 0));
}

/** Index absolu de mois depuis l'an 0 (pour compter les écarts de mois). */
function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

/**
 * Déplie un flux en ses occurrences pour le mois (year, month0).
 *
 * Règles par fréquence :
 *  - monthly   : 1 occurrence au `dayOfMonth` (clampé).
 *  - quarterly : 1 occurrence si l'écart de mois avec l'ancre est multiple de 3.
 *  - yearly    : 1 occurrence si le mois correspond au mois d'ancre.
 *  - weekly    : occurrences tous les 7 jours à partir de l'ancre, dans le mois.
 *  - biweekly  : occurrences tous les 14 jours à partir de l'ancre, dans le mois.
 *
 * Hors période (`anchorDate` postérieure au mois, ou après `endDate`) → [].
 * `active === false` → [].
 */
export function expandOccurrences(
  flow: DatedFlow,
  year: number,
  month0: number,
): DatedOccurrence[] {
  if (flow.active === false) return [];

  const target = monthIndex(year, month0);
  const anchor = flow.anchorDate ?? null;

  // Avant le démarrage du flux ?
  if (anchor) {
    const anchorMonth = monthIndex(anchor.getUTCFullYear(), anchor.getUTCMonth());
    if (target < anchorMonth) return [];
  }
  // Après la fin du flux ?
  if (flow.endDate) {
    const endMonth = monthIndex(flow.endDate.getUTCFullYear(), flow.endDate.getUTCMonth());
    if (target > endMonth) return [];
  }

  const make = (day: number): DatedOccurrence => {
    const d = clampDay(day, year, month0);
    return { day: d, date: utcNoon(year, month0, d), amount: flow.amount };
  };

  switch (flow.frequency) {
    case "monthly": {
      const day = flow.dayOfMonth ?? anchor?.getUTCDate() ?? 1;
      return [make(day)];
    }
    case "quarterly": {
      if (!anchor) {
        const day = flow.dayOfMonth ?? 1;
        return [make(day)];
      }
      const anchorMonth = monthIndex(anchor.getUTCFullYear(), anchor.getUTCMonth());
      if ((target - anchorMonth) % 3 !== 0) return [];
      const day = flow.dayOfMonth ?? anchor.getUTCDate();
      return [make(day)];
    }
    case "yearly": {
      if (anchor && anchor.getUTCMonth() !== month0) return [];
      const day = flow.dayOfMonth ?? anchor?.getUTCDate() ?? 1;
      return [make(day)];
    }
    case "weekly":
    case "biweekly": {
      const step = flow.frequency === "weekly" ? 7 : 14;
      const last = daysInMonth(year, month0);
      // Point de départ : aligné sur l'ancre si possible, sinon le dayOfMonth.
      let start: number;
      if (anchor) {
        const anchorMonth = monthIndex(anchor.getUTCFullYear(), anchor.getUTCMonth());
        if (target === anchorMonth) {
          start = anchor.getUTCDate();
        } else {
          // Rembobine/avance par pas de `step` jours depuis l'ancre jusqu'au mois.
          const anchorDateUtc = utcNoon(
            anchor.getUTCFullYear(),
            anchor.getUTCMonth(),
            anchor.getUTCDate(),
          );
          const firstOfMonth = utcNoon(year, month0, 1);
          const diffDays = Math.round(
            (firstOfMonth.getTime() - anchorDateUtc.getTime()) / 86_400_000,
          );
          const mod = ((diffDays % step) + step) % step;
          start = mod === 0 ? 1 : 1 + (step - mod);
        }
      } else {
        start = flow.dayOfMonth ?? 1;
      }
      const out: DatedOccurrence[] = [];
      for (let day = start; day <= last; day += step) {
        out.push(make(day));
      }
      return out;
    }
    default:
      return [];
  }
}

/** Somme des montants des occurrences d'un flux sur le mois. */
export function sumOccurrences(flow: DatedFlow, year: number, month0: number): number {
  return expandOccurrences(flow, year, month0).reduce((s, o) => s + o.amount, 0);
}

/**
 * Occurrences à venir strictement après `afterDay` (jour courant exclu) — la
 * base du Safe-to-Spend (ce qui reste à tomber d'ici la fin du mois).
 */
export function upcomingOccurrences(
  flow: DatedFlow,
  year: number,
  month0: number,
  afterDay: number,
): DatedOccurrence[] {
  return expandOccurrences(flow, year, month0).filter((o) => o.day > afterDay);
}
