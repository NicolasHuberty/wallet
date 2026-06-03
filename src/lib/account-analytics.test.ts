import { describe, it, expect } from "vitest";
import {
  searchCashflows,
  monthlyExpenseTotals,
  monthlyCategoryShare,
  currentVsAverageSpend,
  type AnalyticsCashflow,
} from "./account-analytics";

const row = (
  date: string,
  amount: number,
  notes: string,
  category: AnalyticsCashflow["category"] = null,
  transferToAccountId: string | null = null,
): AnalyticsCashflow => ({ date, amount, notes, category, transferToAccountId });

describe("searchCashflows", () => {
  const rows = [
    row("2026-01-05", -60, "Q8 Plein d'essence Wavre"),
    row("2026-02-05", -55, "TOTAL ESSENCE"),
    row("2026-02-10", -30, "Delhaize courses"),
  ];

  it("trouve par mot-clé, insensible casse et accents", () => {
    expect(searchCashflows(rows, "essence")).toHaveLength(2);
    expect(searchCashflows(rows, "ESSENCE")).toHaveLength(2);
    expect(searchCashflows(rows, "Délhaize")).toHaveLength(1);
  });

  it("renvoie tout pour une requête vide", () => {
    expect(searchCashflows(rows, "  ")).toHaveLength(3);
  });
});

describe("monthlyExpenseTotals", () => {
  it("somme les dépenses par mois en valeur absolue, ignore entrées et virements internes", () => {
    const rows = [
      row("2026-01-05", -60, "essence"),
      row("2026-01-20", -40, "courses"),
      row("2026-01-25", 2500, "salaire"), // entrée → ignorée
      row("2026-01-28", -300, "vers épargne", null, "acc-2"), // virement interne → ignoré
      row("2026-02-03", -50, "essence"),
    ];
    expect(monthlyExpenseTotals(rows)).toEqual([
      { month: "2026-01", spend: 100, count: 2 },
      { month: "2026-02", spend: 50, count: 1 },
    ]);
  });
});

describe("monthlyCategoryShare", () => {
  it("calcule la part (%) de chaque catégorie dans les dépenses du mois", () => {
    const rows = [
      row("2026-01-05", -75, "essence", "transport"),
      row("2026-01-20", -25, "courses", "food_groceries"),
    ];
    const share = monthlyCategoryShare(rows);
    expect(share).toHaveLength(1);
    expect(share[0].month).toBe("2026-01");
    expect(share[0].transport).toBeCloseTo(75);
    expect(share[0].food_groceries).toBeCloseTo(25);
  });
});

describe("currentVsAverageSpend", () => {
  it("compare le mois courant à la moyenne des mois précédents complets", () => {
    const rows = [
      row("2026-01-10", -100, "x", "transport"),
      row("2026-02-10", -200, "x", "transport"),
      row("2026-03-10", -150, "x", "transport"), // mois courant
    ];
    const c = currentVsAverageSpend(rows, "2026-03");
    expect(c.current).toBe(150);
    expect(c.average).toBe(150); // (100 + 200) / 2
    expect(c.deltaPct).toBeCloseTo(0);
    expect(c.monthsCount).toBe(2);
  });

  it("deltaPct null quand pas d'historique", () => {
    const c = currentVsAverageSpend([row("2026-03-10", -150, "x")], "2026-03");
    expect(c.average).toBe(0);
    expect(c.deltaPct).toBeNull();
  });
});
