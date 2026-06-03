import { describe, it, expect } from "vitest";
import { matchesCounterparty, previewPoste } from "./postes";
import type { AnalyticsCashflow } from "./account-analytics";

describe("matchesCounterparty", () => {
  it("matche par sous-chaîne, insensible casse/accents/forme", () => {
    expect(matchesCounterparty("8029 Dats Gembloux", ["dats"])).toBe(true);
    expect(matchesCounterparty("SHELL 7037 LES ISN", ["shell"])).toBe(true);
    expect(matchesCounterparty("Café Léon", ["cafe leon"])).toBe(true);
    expect(matchesCounterparty("Delhaize", ["dats"])).toBe(false);
  });

  it("ignore les motifs trop courts et la description vide", () => {
    expect(matchesCounterparty("Dats", ["a"])).toBe(false);
    expect(matchesCounterparty(null, ["dats"])).toBe(false);
  });
});

type Row = AnalyticsCashflow & { id: string; notes: string | null };
const row = (id: string, amount: number, notes: string, category: AnalyticsCashflow["category"] = null): Row => ({
  id,
  amount,
  notes,
  category,
  date: "2026-03-10",
});

describe("previewPoste", () => {
  const rows: Row[] = [
    row("1", -60, "8029 Dats Gembloux", "fuel"),
    row("2", -55, "Shell Les Isnes", "fuel"),
    row("3", -40, "Esso Gembloux", "fuel"),
    row("4", -50, "Delhaize", "food_groceries"),
    row("5", 2500, "Salaire", "income_salary"),
  ];

  it("compte l'impact par règle de contrepartie", () => {
    const p = previewPoste(rows, { counterpartyPatterns: ["dats", "shell"], txCategories: [] });
    expect(p.byPattern).toEqual([
      { pattern: "dats", count: 1, total: 60 },
      { pattern: "shell", count: 1, total: 55 },
    ]);
    expect(p.totalCount).toBe(2);
    expect(p.totalAmount).toBe(115);
  });

  it("matche aussi par catégorie et déduplique", () => {
    // catégorie fuel = 3 transactions ; + pattern dats (déjà fuel) → pas de doublon
    const p = previewPoste(rows, { counterpartyPatterns: ["dats"], txCategories: ["fuel"] });
    expect(p.totalCount).toBe(3);
    expect(p.totalAmount).toBe(155);
    expect(p.matched.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("exclut les entrées (revenus) et trie par montant décroissant", () => {
    const p = previewPoste(rows, { counterpartyPatterns: [], txCategories: ["fuel", "income_salary"] });
    expect(p.matched.every((m) => m.amount > 0)).toBe(true);
    expect(p.matched[0].amount).toBe(60);
    expect(p.totalCount).toBe(3); // le salaire (entrée) est exclu
  });
});
