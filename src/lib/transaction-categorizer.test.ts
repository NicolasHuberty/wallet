import { describe, it, expect } from "vitest";
import { classifyTransaction, summariseByCategory } from "./transaction-categorizer";

describe("classifyTransaction", () => {
  it("recognises Belgian groceries", () => {
    expect(classifyTransaction({ amount: -45.2, notes: "DELHAIZE Wavre" })).toBe(
      "food_groceries",
    );
    expect(classifyTransaction({ amount: -120.4, notes: "COLRUYT" })).toBe("food_groceries");
    expect(classifyTransaction({ amount: -8.5, notes: "Lidl Etterbeek" })).toBe(
      "food_groceries",
    );
  });

  it("recognises restaurant / takeaway", () => {
    expect(classifyTransaction({ amount: -18.9, notes: "DELIVEROO BE" })).toBe(
      "food_restaurant",
    );
    expect(classifyTransaction({ amount: -25, notes: "Restaurant Le Bistro" })).toBe(
      "food_restaurant",
    );
    expect(classifyTransaction({ amount: -12, notes: "PIZZA HUT" })).toBe("food_restaurant");
  });

  it("recognises transport", () => {
    expect(classifyTransaction({ amount: -49, notes: "STIB-MIVB Brussels" })).toBe(
      "transport",
    );
    expect(classifyTransaction({ amount: -56, notes: "SNCB" })).toBe("transport");
    expect(classifyTransaction({ amount: -78, notes: "Q8 station" })).toBe("transport");
    expect(classifyTransaction({ amount: -3.5, notes: "Interparking Bruxelles" })).toBe(
      "transport",
    );
  });

  it("recognises subscriptions", () => {
    expect(classifyTransaction({ amount: -13.99, notes: "Netflix.com" })).toBe(
      "subscriptions",
    );
    expect(classifyTransaction({ amount: -9.99, notes: "Spotify" })).toBe("subscriptions");
    expect(classifyTransaction({ amount: -20, notes: "OPENAI ChatGPT Plus" })).toBe(
      "subscriptions",
    );
  });

  it("recognises utilities & telecom", () => {
    expect(classifyTransaction({ amount: -85, notes: "Engie Electrabel" })).toBe("utilities");
    expect(classifyTransaction({ amount: -32, notes: "Proximus monthly" })).toBe(
      "telecom_internet",
    );
  });

  it("recognises salary income", () => {
    expect(
      classifyTransaction({ amount: 2300, notes: "Salaire UCLouvain" }),
    ).toBe("income_salary");
  });

  it("recognises pharmacy & insurance", () => {
    expect(classifyTransaction({ amount: -22, notes: "Pharmacie Etterbeek" })).toBe("health");
    expect(classifyTransaction({ amount: -45, notes: "AXA assurance" })).toBe("insurance");
  });

  it("falls back sensibly", () => {
    expect(classifyTransaction({ amount: -10, notes: "Random merchant" })).toBe(
      "other_expense",
    );
    expect(classifyTransaction({ amount: 15, notes: "Random credit" })).toBe("income_other");
    expect(classifyTransaction({ amount: -10, notes: null })).toBe("other_expense");
  });

  it("honours pre-typed kinds over keywords", () => {
    expect(
      classifyTransaction({ amount: -5, notes: "Robo Management Fee", existingKind: "fee" }),
    ).toBe("fees_bank");
    expect(
      classifyTransaction({ amount: 12, notes: "Dividend EXI2", existingKind: "dividend" }),
    ).toBe("income_other");
  });
});

describe("summariseByCategory", () => {
  it("aggregates totals and counts per category", () => {
    const rows = [
      { amount: -10, notes: "Delhaize" },
      { amount: -5, notes: "Carrefour" },
      { amount: -25, notes: "Netflix" },
      { amount: 2000, notes: "Salaire UCLouvain" },
    ];
    const r = summariseByCategory(rows);
    expect(r.food_groceries.count).toBe(2);
    expect(r.food_groceries.total).toBeCloseTo(-15, 4);
    expect(r.subscriptions.count).toBe(1);
    expect(r.income_salary.total).toBe(2000);
  });
});
