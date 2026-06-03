import { describe, it, expect } from "vitest";
import {
  deriveSpendEvents,
  envelopeFineCategories,
  resolveEnvelope,
  type AffectCashflow,
  type AffectEnvelope,
} from "./affect";

const env = (
  id: string,
  label: string,
  category: string,
  active = true,
): AffectEnvelope => ({ id, label, category, active });

const NO_FIXED = new Set<string>();

const tx = (
  amount: number,
  category: string | null,
  day = 15,
  transferToAccountId: string | null = null,
): AffectCashflow => ({
  amount,
  category,
  transferToAccountId,
  date: new Date(Date.UTC(2026, 5, day, 12)), // juin 2026
});

const today = new Date(Date.UTC(2026, 5, 20, 12));

describe("envelopeFineCategories", () => {
  it("désambiguïse courses vs restaurant dans la catégorie food", () => {
    expect(envelopeFineCategories(env("a", "Courses", "food"))).toEqual(
      new Set(["food_groceries"]),
    );
    expect(envelopeFineCategories(env("b", "Restaurants", "food"))).toEqual(
      new Set(["food_restaurant"]),
    );
  });

  it("food générique absorbe les deux", () => {
    expect(envelopeFineCategories(env("c", "Bouffe", "food"))).toEqual(
      new Set(["food_groceries", "food_restaurant"]),
    );
  });

  it("leisure : shopping vs sorties", () => {
    expect(envelopeFineCategories(env("d", "Shopping", "leisure"))).toEqual(
      new Set(["shopping"]),
    );
    expect(envelopeFineCategories(env("e", "Sorties / bar", "leisure"))).toEqual(
      new Set(["leisure"]),
    );
  });

  it("utilities absorbe aussi le télécom", () => {
    expect(envelopeFineCategories(env("f", "Énergie", "utilities"))).toEqual(
      new Set(["utilities", "telecom_internet"]),
    );
  });
});

describe("resolveEnvelope", () => {
  it("route les courses vers l'enveloppe Courses, pas Restaurants (collision food)", () => {
    const envelopes = [env("groc", "Courses", "food"), env("rest", "Restaurants", "food")];
    expect(resolveEnvelope("food_groceries", envelopes)).toBe("groc");
    expect(resolveEnvelope("food_restaurant", envelopes)).toBe("rest");
  });

  it("repli grossier quand aucune enveloppe fine ne matche", () => {
    const envelopes = [env("t", "Transport", "transport")];
    expect(resolveEnvelope("transport", envelopes)).toBe("t");
  });

  it("shopping retombe sur leisure en grossier si pas d'enveloppe shopping dédiée", () => {
    const envelopes = [env("l", "Vie sociale", "leisure")];
    // « Vie sociale » n'a aucun mot-clé → absorbe leisure+shopping → fine match.
    expect(resolveEnvelope("shopping", envelopes)).toBe("l");
  });

  it("→ null (coussin) si aucune enveloppe ne correspond", () => {
    const envelopes = [env("f", "Courses", "food")];
    expect(resolveEnvelope("transport", envelopes)).toBeNull();
  });

  it("ignore les enveloppes inactives", () => {
    const envelopes = [env("t", "Transport", "transport", false)];
    expect(resolveEnvelope("transport", envelopes)).toBeNull();
  });

  it("collision : préfère l'enveloppe la plus spécifique", () => {
    const envelopes = [
      env("generic", "Bouffe", "food"), // {groceries, restaurant}
      env("groc", "Courses Delhaize", "food"), // {groceries}
    ];
    expect(resolveEnvelope("food_groceries", envelopes)).toBe("groc");
  });
});

describe("deriveSpendEvents", () => {
  const envelopes = [
    env("groc", "Courses", "food"),
    env("rest", "Restaurants", "food"),
    env("fun", "Sorties", "leisure"),
  ];

  it("transforme un débit catégorisé en consommation d'enveloppe (montant positif)", () => {
    const rows = deriveSpendEvents([tx(-50, "food_groceries")], envelopes, NO_FIXED, today);
    expect(rows).toEqual([
      { amount: 50, envelopeId: "groc", chargedToBuffer: false, date: tx(-50, "food_groceries").date },
    ]);
  });

  it("ignore les revenus, virements internes et épargne", () => {
    const rows = deriveSpendEvents(
      [
        tx(2500, "income_salary"),
        tx(-300, "transfer_internal"),
        tx(-300, "savings_invest"),
        tx(-100, "cash_withdrawal"),
      ],
      envelopes,
      NO_FIXED,
      today,
    );
    expect(rows).toEqual([]);
  });

  it("ignore les sorties d'un autre mois", () => {
    const julyTx: AffectCashflow = {
      amount: -40,
      category: "food_groceries",
      transferToAccountId: null,
      date: new Date(Date.UTC(2026, 6, 3, 12)),
    };
    expect(deriveSpendEvents([julyTx], envelopes, NO_FIXED, today)).toEqual([]);
  });

  it("ignore un débit marqué comme virement interne même si catégorisé", () => {
    expect(deriveSpendEvents([tx(-200, "food_groceries", 15, "acc-2")], envelopes, NO_FIXED, today)).toEqual([]);
  });

  it("impute au coussin une dépense variable sans enveloppe correspondante", () => {
    const rows = deriveSpendEvents([tx(-30, "health")], envelopes, NO_FIXED, today);
    expect(rows).toHaveLength(1);
    expect(rows[0].envelopeId).toBeNull();
    expect(rows[0].chargedToBuffer).toBe(true);
    expect(rows[0].amount).toBe(30);
  });

  it("exclut une dépense couverte par une charge fixe (échéancier) — pas de double compte", () => {
    // Mutualité catégorisée 'health', aucune enveloppe santé, mais une charge
    // fixe 'health' existe → déjà dans remainingFixed → ignorée.
    const fixed = new Set(["health"]);
    expect(deriveSpendEvents([tx(-120, "health")], envelopes, fixed, today)).toEqual([]);
  });

  it("une enveloppe dédiée prime sur la charge fixe de même catégorie", () => {
    const withHealthEnv = [...envelopes, env("med", "Pharmacie", "health")];
    const fixed = new Set(["health"]);
    const rows = deriveSpendEvents([tx(-120, "health")], withHealthEnv, fixed, today);
    expect(rows).toEqual([
      { amount: 120, envelopeId: "med", chargedToBuffer: false, date: tx(-120, "health").date },
    ]);
  });

  it("respecte les txCategories explicites de l'enveloppe (override de l'heuristique)", () => {
    // L'enveloppe « Plaisirs » revendique explicitement food_restaurant.
    const custom: AffectEnvelope[] = [
      env("groc", "Courses", "food"),
      { id: "plz", label: "Plaisirs", category: "food", active: true, txCategories: ["food_restaurant"] },
    ];
    expect(deriveSpendEvents([tx(-40, "food_restaurant")], custom, NO_FIXED, today)[0].envelopeId).toBe("plz");
    expect(deriveSpendEvents([tx(-40, "food_groceries")], custom, NO_FIXED, today)[0].envelopeId).toBe("groc");
  });

  it("laisse de côté les transactions non classées (conservateur)", () => {
    expect(deriveSpendEvents([tx(-25, null)], envelopes, NO_FIXED, today)).toEqual([]);
  });

  it("ignore les catégories inconnues / legacy", () => {
    expect(deriveSpendEvents([tx(-25, "legacy_weird_value")], envelopes, NO_FIXED, today)).toEqual([]);
  });
});
