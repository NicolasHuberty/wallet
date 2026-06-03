import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  clampDay,
  expandOccurrences,
  sumOccurrences,
  upcomingOccurrences,
  type DatedFlow,
} from "./occurrences";

describe("daysInMonth", () => {
  it("gère les mois standards", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // janvier
    expect(daysInMonth(2026, 3)).toBe(30); // avril
  });
  it("gère février bissextile et non bissextile", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
  });
});

describe("clampDay", () => {
  it("clampe au dernier jour du mois court", () => {
    expect(clampDay(31, 2026, 3)).toBe(30); // avril
    expect(clampDay(31, 2026, 1)).toBe(28); // février
  });
  it("laisse passer les jours valides et borne le minimum", () => {
    expect(clampDay(15, 2026, 0)).toBe(15);
    expect(clampDay(0, 2026, 0)).toBe(1);
  });
});

describe("expandOccurrences — monthly", () => {
  const base: DatedFlow = { amount: 100, dayOfMonth: 12, frequency: "monthly" };

  it("renvoie une occurrence au dayOfMonth", () => {
    const occ = expandOccurrences(base, 2026, 5); // juin
    expect(occ).toHaveLength(1);
    expect(occ[0].day).toBe(12);
    expect(occ[0].amount).toBe(100);
  });

  it("clampe dayOfMonth=31 au dernier jour", () => {
    const occ = expandOccurrences({ ...base, dayOfMonth: 31 }, 2026, 1); // février
    expect(occ[0].day).toBe(28);
  });

  it("rend [] si en pause", () => {
    expect(expandOccurrences({ ...base, active: false }, 2026, 5)).toEqual([]);
  });
});

describe("expandOccurrences — bornes anchorDate / endDate", () => {
  const flow: DatedFlow = {
    amount: 50,
    dayOfMonth: 5,
    frequency: "monthly",
    anchorDate: new Date(Date.UTC(2026, 3, 1)), // démarre en avril
    endDate: new Date(Date.UTC(2026, 7, 1)), // finit en août
  };

  it("rien avant le mois d'ancrage", () => {
    expect(expandOccurrences(flow, 2026, 2)).toEqual([]); // mars
  });
  it("occurrence pendant la période", () => {
    expect(expandOccurrences(flow, 2026, 5)).toHaveLength(1); // juin
  });
  it("rien après endDate", () => {
    expect(expandOccurrences(flow, 2026, 8)).toEqual([]); // septembre
  });
});

describe("expandOccurrences — yearly", () => {
  const flow: DatedFlow = {
    amount: 300,
    dayOfMonth: 10,
    frequency: "yearly",
    anchorDate: new Date(Date.UTC(2025, 5, 10)), // ancre en juin
  };
  it("survient uniquement le mois d'ancre", () => {
    expect(expandOccurrences(flow, 2026, 5)).toHaveLength(1); // juin
    expect(expandOccurrences(flow, 2026, 6)).toEqual([]); // juillet
  });
});

describe("expandOccurrences — quarterly", () => {
  const flow: DatedFlow = {
    amount: 90,
    dayOfMonth: 1,
    frequency: "quarterly",
    anchorDate: new Date(Date.UTC(2026, 0, 1)), // ancre janvier
  };
  it("survient tous les 3 mois depuis l'ancre", () => {
    expect(expandOccurrences(flow, 2026, 0)).toHaveLength(1); // janvier
    expect(expandOccurrences(flow, 2026, 3)).toHaveLength(1); // avril
    expect(expandOccurrences(flow, 2026, 1)).toEqual([]); // février
    expect(expandOccurrences(flow, 2026, 2)).toEqual([]); // mars
  });
});

describe("expandOccurrences — weekly", () => {
  const flow: DatedFlow = {
    amount: 90,
    dayOfMonth: 3,
    frequency: "weekly",
  };
  it("génère ~4-5 occurrences espacées de 7 jours", () => {
    const occ = expandOccurrences(flow, 2026, 0); // janvier 31j, départ le 3
    expect(occ.map((o) => o.day)).toEqual([3, 10, 17, 24, 31]);
  });
});

describe("sumOccurrences & upcomingOccurrences", () => {
  it("somme les occurrences du mois", () => {
    const flow: DatedFlow = { amount: 90, dayOfMonth: 3, frequency: "weekly" };
    expect(sumOccurrences(flow, 2026, 0)).toBe(90 * 5);
  });
  it("ne garde que les occurrences strictement après le jour courant", () => {
    const flow: DatedFlow = { amount: 90, dayOfMonth: 3, frequency: "weekly" };
    const up = upcomingOccurrences(flow, 2026, 0, 12);
    expect(up.map((o) => o.day)).toEqual([17, 24, 31]);
  });
});
