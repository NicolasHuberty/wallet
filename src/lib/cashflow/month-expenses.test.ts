import { describe, it, expect } from "vitest";
import {
  buildMonthTransactions,
  merchantPattern,
  bucketByDay,
  bucketByWeek,
  type MonthRawTx,
  type MonthTransaction,
} from "./month-expenses";
import type { AffectEnvelope } from "./affect";

const env = (id: string, label: string, category: string): AffectEnvelope => ({
  id,
  label,
  category,
  active: true,
});

const bank = (
  id: string,
  amount: number,
  category: string | null,
  notes: string | null = null,
  day = 15,
  transferToAccountId: string | null = null,
): MonthRawTx => ({
  id,
  amount,
  category: category as never,
  notes,
  transferToAccountId,
  accountId: "acc1",
  accountName: "Compte courant",
  date: new Date(Date.UTC(2026, 5, day, 12)),
});

const ENVS = [env("e_food", "Courses", "food"), env("e_fun", "Sorties", "leisure")];
const META = {
  e_food: { label: "Courses", category: "food" },
  e_fun: { label: "Sorties", category: "leisure" },
};

describe("buildMonthTransactions", () => {
  it("route une dépense vers l'enveloppe correspondante", () => {
    const out = buildMonthTransactions({
      bank: [bank("t1", -42, "food_groceries", "DELHAIZE BRUXELLES")],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      amount: 42,
      affectation: "envelope",
      envelopeId: "e_food",
      envelopeLabel: "Courses",
      category: "food_groceries",
    });
  });

  it("ignore les entrées et les virements internes", () => {
    const out = buildMonthTransactions({
      bank: [
        bank("in", 2900, "income_salary", "SALAIRE"),
        bank("xfer", -500, "transfer_internal", "Vers épargne", 15, "acc2"),
      ],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out).toHaveLength(0);
  });

  it("classe une charge fixe (catégorie revendiquée) en 'fixed'", () => {
    const out = buildMonthTransactions({
      bank: [bank("rent", -900, "housing", "LOYER")],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(["housing"]),
      fixedPatterns: [],
    });
    expect(out[0].affectation).toBe("fixed");
    expect(out[0].envelopeId).toBeNull();
  });

  it("impute au coussin une dépense variable sans enveloppe dédiée", () => {
    const out = buildMonthTransactions({
      bank: [bank("h", -30, "health", "PHARMACIE")],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out[0].affectation).toBe("buffer");
  });

  it("exclut une transaction ignorée (affectation 'ignored', aucune enveloppe)", () => {
    const t = bank("ign", -90, "shopping", "UNIQLO EUROPE");
    t.ignored = true;
    const out = buildMonthTransactions({
      bank: [t],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out[0].affectation).toBe("ignored");
    expect(out[0].envelopeId).toBeNull();
  });

  it("marque un retrait cash comme non_spend (sortie hors variable)", () => {
    const out = buildMonthTransactions({
      bank: [bank("atm", -100, "cash_withdrawal", "ATM RETRAIT")],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out[0].affectation).toBe("non_spend");
  });

  it("inclut les dépenses manuelles rattachées à une enveloppe", () => {
    const out = buildMonthTransactions({
      bank: [],
      manual: [
        {
          id: "m1",
          date: new Date(Date.UTC(2026, 5, 10, 12)),
          amount: 20,
          envelopeId: "e_fun",
          chargedToBuffer: false,
          label: "Bar",
        },
      ],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out[0]).toMatchObject({
      source: "manual",
      affectation: "envelope",
      envelopeId: "e_fun",
      envelopeLabel: "Sorties",
    });
  });

  it("trie du plus récent au plus ancien", () => {
    const out = buildMonthTransactions({
      bank: [
        bank("old", -10, "food_groceries", "A", 2),
        bank("new", -10, "food_groceries", "B", 25),
      ],
      manual: [],
      envelopes: ENVS,
      envelopeMeta: META,
      fixedCategories: new Set(),
      fixedPatterns: [],
    });
    expect(out.map((t: MonthTransaction) => t.id)).toEqual(["new", "old"]);
  });
});

describe("merchantPattern", () => {
  it("extrait un motif normalisé du marchand", () => {
    expect(merchantPattern("DELHAIZE BRUXELLES  BE12 3456")).toBe("delhaize bruxelles");
  });
  it("renvoie null sur description vide", () => {
    expect(merchantPattern(null)).toBeNull();
    expect(merchantPattern("  ")).toBeNull();
  });
});

describe("bucketByDay / bucketByWeek", () => {
  const txs: MonthTransaction[] = [
    { id: "a", source: "bank", date: "2026-06-01T10:00:00.000Z", amount: 10, label: "", accountId: null, accountName: null, category: null, envelopeId: null, envelopeLabel: null, affectation: "buffer" },
    { id: "b", source: "bank", date: "2026-06-01T12:00:00.000Z", amount: 5, label: "", accountId: null, accountName: null, category: null, envelopeId: null, envelopeLabel: null, affectation: "buffer" },
    { id: "c", source: "bank", date: "2026-06-09T12:00:00.000Z", amount: 20, label: "", accountId: null, accountName: null, category: null, envelopeId: null, envelopeLabel: null, affectation: "buffer" },
  ];
  it("agrège par jour", () => {
    const d = bucketByDay(txs);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ label: "01", spend: 15, count: 2 });
  });
  it("agrège par semaine", () => {
    const w = bucketByWeek(txs);
    expect(w).toHaveLength(2);
    expect(w[0].spend).toBe(15);
    expect(w[1].spend).toBe(20);
  });
});
