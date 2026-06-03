import { describe, it, expect } from "vitest";
import { assembleDashboard, type AssembleInput } from "./assemble";

const start = new Date(Date.UTC(2024, 0, 1));

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    today: new Date(Date.UTC(2026, 5, 16)), // 16 juin 2026
    availableBalance: 1500,
    incomes: [
      {
        label: "Salaire",
        amount: 2600,
        dayOfMonth: 28,
        frequency: "monthly",
        isVariable: false,
        floorAmount: null,
        startDate: start,
        endDate: null,
      },
    ],
    fixedExpenses: [
      {
        label: "Loyer",
        amount: 900,
        dayOfMonth: 1,
        frequency: "monthly",
        flowType: "fixed",
        active: true,
        startDate: start,
        endDate: null,
      },
      {
        label: "Spotify",
        amount: 11,
        dayOfMonth: 20,
        frequency: "monthly",
        flowType: "fixed",
        active: true,
        startDate: start,
        endDate: null,
      },
    ],
    envelopes: [
      {
        id: "env-courses",
        label: "Courses",
        category: "food",
        monthlyAmount: 360,
        cadence: "weekly",
        occurrencesPerMonth: 4.33,
        active: true,
      },
      {
        id: "env-bar",
        label: "Bar",
        category: "leisure",
        monthlyAmount: 120,
        cadence: "per_occurrence",
        occurrencesPerMonth: 3,
        active: true,
      },
    ],
    spendEvents: [
      { amount: 72, envelopeId: "env-courses", chargedToBuffer: false },
      { amount: 40, envelopeId: "env-bar", chargedToBuffer: false },
    ],
    committedSavings: 0,
    bufferAmount: 100,
    ...overrides,
  };
}

describe("assembleDashboard", () => {
  it("calcule le mois et le jour courant", () => {
    const d = assembleDashboard(baseInput());
    expect(d.month).toBe("2026-06");
    expect(d.dayOfMonth).toBe(16);
    expect(d.daysInMonth).toBe(30);
  });

  it("agrège les plans (revenus, fixes, variables)", () => {
    const d = assembleDashboard(baseInput());
    expect(d.plannedIncome).toBe(2600);
    expect(d.plannedFixed).toBe(911);
    expect(d.plannedVariable).toBe(480);
  });

  it("ne compte dans remainingFixed que les fixes après le jour courant", () => {
    // Loyer le 1 (passé), Spotify le 20 (à venir) → seul Spotify reste
    const d = assembleDashboard(baseInput());
    // Safe = 1500 + 0 (pas de revenu après le 16 ? salaire le 28 → +2600)
    //      - 11 (spotify) - variableRemaining - 0 - bufferRemaining
    // variableRemaining = (360-72) + (120-40) = 288 + 80 = 368
    // bufferRemaining = 100
    // remainingIncome = 2600 (salaire le 28 > 16)
    expect(d.safe.safeToSpend).toBe(1500 + 2600 - 11 - 368 - 0 - 100);
  });

  it("construit la timeline triée des occurrences à venir", () => {
    const d = assembleDashboard(baseInput());
    // À venir après le 16 : Spotify (20), Salaire (28)
    expect(d.upcoming.map((u) => u.label)).toEqual(["Spotify", "Salaire"]);
    expect(d.upcoming[0].kind).toBe("expense");
    expect(d.upcoming[1].kind).toBe("income");
  });

  it("calcule la consommation et le pacing par enveloppe", () => {
    const d = assembleDashboard(baseInput());
    const courses = d.envelopes.find((e) => e.id === "env-courses")!;
    expect(courses.consumed).toBe(72);
    expect(courses.remaining).toBe(288);
  });

  it("impute au coussin les dépenses sans enveloppe", () => {
    const d = assembleDashboard(
      baseInput({
        spendEvents: [{ amount: 30, envelopeId: null, chargedToBuffer: true }],
      }),
    );
    expect(d.bufferRemaining).toBe(70);
  });

  it("ignore les enveloppes inactives", () => {
    const d = assembleDashboard(
      baseInput({
        envelopes: [
          {
            id: "x",
            label: "Inactif",
            category: "other",
            monthlyAmount: 999,
            cadence: "monthly",
            occurrencesPerMonth: null,
            active: false,
          },
        ],
        spendEvents: [],
      }),
    );
    expect(d.plannedVariable).toBe(0);
    expect(d.envelopes).toHaveLength(0);
  });

  it("agrège la consommation variable de la semaine en cours", () => {
    // today = mardi 16 juin 2026 → semaine depuis lundi 15
    const d = assembleDashboard(
      baseInput({
        spendEvents: [
          { amount: 30, envelopeId: "env-courses", chargedToBuffer: false, date: new Date(Date.UTC(2026, 5, 15, 10)) }, // lundi → dans la semaine
          { amount: 20, envelopeId: "env-bar", chargedToBuffer: false, date: new Date(Date.UTC(2026, 5, 9, 10)) }, // semaine précédente
        ],
      }),
    );
    expect(d.weekVariableConsumed).toBe(30);
    expect(d.weekVariablePlanned).toBeGreaterThan(0);
  });

  it("utilise le plancher pour un revenu variable", () => {
    const d = assembleDashboard(
      baseInput({
        today: new Date(Date.UTC(2026, 5, 1)), // 1er, salaire le 28 à venir
        incomes: [
          {
            label: "Freelance",
            amount: 3000,
            dayOfMonth: 28,
            frequency: "monthly",
            isVariable: true,
            floorAmount: 1500,
            startDate: start,
            endDate: null,
          },
        ],
      }),
    );
    expect(d.plannedIncome).toBe(1500);
  });
});
