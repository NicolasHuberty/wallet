import { describe, it, expect } from "vitest";
import { computeSafeToSpend } from "./safe-to-spend";

describe("computeSafeToSpend", () => {
  it("applique la formule et le budget/jour", () => {
    const r = computeSafeToSpend({
      availableBalance: 1000,
      remainingIncome: 0,
      remainingFixed: 200,
      variableRemaining: 300,
      committedSavings: 0,
      bufferRemaining: 50,
      dayOfMonth: 16,
      daysInMonth: 30,
    });
    // 1000 - 200 - 300 - 50 = 450
    expect(r.safeToSpend).toBe(450);
    // jours restants = 30 - 16 + 1 = 15 → 30/jour
    expect(r.daysRemaining).toBe(15);
    expect(r.budgetPerDay).toBe(30);
  });

  it("le coussin non dépensé reste dans le solde projeté", () => {
    const r = computeSafeToSpend({
      availableBalance: 1000,
      remainingIncome: 0,
      remainingFixed: 0,
      variableRemaining: 0,
      committedSavings: 0,
      bufferRemaining: 100,
      dayOfMonth: 1,
      daysInMonth: 30,
    });
    expect(r.safeToSpend).toBe(900); // coussin réservé
    expect(r.projectedEndBalance).toBe(1000); // coussin non dépensé reste
  });

  it("Safe-to-Spend négatif → rouge, budget/jour borné à 0", () => {
    const r = computeSafeToSpend({
      availableBalance: 100,
      remainingIncome: 0,
      remainingFixed: 200,
      variableRemaining: 50,
      committedSavings: 0,
      bufferRemaining: 0,
      dayOfMonth: 20,
      daysInMonth: 30,
    });
    expect(r.safeToSpend).toBeLessThan(0);
    expect(r.budgetPerDay).toBe(0);
    expect(r.color).toBe("red");
  });

  it("n'ajoute PAS les revenus à venir au Safe-to-Spend (pas de double comptage)", () => {
    const r = computeSafeToSpend({
      availableBalance: 100,
      remainingIncome: 2000,
      remainingFixed: 500,
      variableRemaining: 300,
      committedSavings: 400,
      bufferRemaining: 0,
      dayOfMonth: 10,
      daysInMonth: 30,
    });
    // Safe = solde − fixes − variables − épargne − coussin (sans revenus à venir)
    expect(r.safeToSpend).toBe(100 - 500 - 300 - 400);
    // … mais le solde projeté de fin de mois, lui, intègre les revenus à venir.
    expect(r.projectedEndBalance).toBe(100 + 2000 - 500 - 300 - 400);
  });

  it("couleur fine via le pacing discrétionnaire", () => {
    const r = computeSafeToSpend({
      availableBalance: 1000,
      remainingIncome: 0,
      remainingFixed: 0,
      variableRemaining: 100,
      committedSavings: 0,
      bufferRemaining: 0,
      dayOfMonth: 15,
      daysInMonth: 30,
      discretionaryPlanned: 400,
      discretionaryConsumed: 320, // velocity = 0.8 / 0.5 = 1.6 → fast → orange
    });
    expect(r.color).toBe("orange");
  });

  it("jour 1 → neutral", () => {
    const r = computeSafeToSpend({
      availableBalance: 1000,
      remainingIncome: 0,
      remainingFixed: 0,
      variableRemaining: 100,
      committedSavings: 0,
      bufferRemaining: 0,
      dayOfMonth: 1,
      daysInMonth: 30,
      discretionaryPlanned: 400,
      discretionaryConsumed: 0,
    });
    expect(r.color).toBe("neutral");
  });
});
