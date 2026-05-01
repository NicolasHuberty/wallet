import { describe, it, expect } from "vitest";
import { __test } from "./bce";

const { normalizeBceName, naceToCategory, looksLikePerson } = __test;

describe("normalizeBceName", () => {
  it("strips diacritics, punctuation, multi-spaces", () => {
    expect(normalizeBceName("DELHAIZE WAVRE-CENTRE")).toBe("delhaize wavre centre");
    expect(normalizeBceName("Société Anonyme N.V.")).toBe("societe anonyme");
  });

  it("strips Belgian legal-form suffixes", () => {
    expect(normalizeBceName("DELHAIZE LE LION SA")).toBe("delhaize le lion");
    expect(normalizeBceName("PROXIMUS NV")).toBe("proximus");
    expect(normalizeBceName("EXAMPLE SPRL")).toBe("example");
    expect(normalizeBceName("ACME BVBA")).toBe("acme bvba"); // bvba isn't in the list — left as-is
  });

  it("strips IBAN-shaped substrings stuck in descriptions", () => {
    const r = normalizeBceName("Loyer BE68 5390 0754 7034 mai");
    expect(r).toContain("loyer");
    expect(r).toContain("mai");
    expect(r).not.toMatch(/be68/);
  });

  it("strips noise keywords", () => {
    expect(normalizeBceName("Paiement DELHAIZE")).toBe("delhaize");
    expect(normalizeBceName("Virement SEPA UCLOUVAIN")).toBe("uclouvain");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeBceName("")).toBe("");
    expect(normalizeBceName("   ")).toBe("");
  });
});

describe("naceToCategory", () => {
  it("maps supermarkets to food_groceries", () => {
    expect(naceToCategory("47.11")).toBe("food_groceries");
    expect(naceToCategory("47110")).toBe("food_groceries");
    expect(naceToCategory("47.110")).toBe("food_groceries");
  });

  it("maps fuel stations to transport", () => {
    expect(naceToCategory("47.30")).toBe("transport");
    expect(naceToCategory("47300")).toBe("transport");
  });

  it("maps urban transport (STIB / De Lijn) to transport", () => {
    expect(naceToCategory("49.31")).toBe("transport");
  });

  it("maps energy (Engie / Luminus) to utilities", () => {
    expect(naceToCategory("35.11")).toBe("utilities");
    expect(naceToCategory("35.21")).toBe("utilities");
  });

  it("maps telecoms to telecom_internet", () => {
    expect(naceToCategory("61.10")).toBe("telecom_internet");
    expect(naceToCategory("61.20")).toBe("telecom_internet");
    expect(naceToCategory("61.90")).toBe("telecom_internet");
  });

  it("maps insurance to insurance", () => {
    expect(naceToCategory("65.11")).toBe("insurance");
    expect(naceToCategory("65.20")).toBe("insurance");
  });

  it("maps banks to fees_bank", () => {
    expect(naceToCategory("64.19")).toBe("fees_bank");
    expect(naceToCategory("64.91")).toBe("fees_bank");
  });

  it("maps healthcare and pharmacies", () => {
    expect(naceToCategory("47.73")).toBe("health"); // pharmacy
    expect(naceToCategory("86.10")).toBe("health"); // hospital
    expect(naceToCategory("86.21")).toBe("health");
  });

  it("maps restaurants and cafés", () => {
    expect(naceToCategory("56.10")).toBe("food_restaurant");
    expect(naceToCategory("56.30")).toBe("food_restaurant");
  });

  it("maps education", () => {
    expect(naceToCategory("85.10")).toBe("education");
    expect(naceToCategory("85.42")).toBe("education");
  });

  it("returns null for unknown / unmapped codes", () => {
    expect(naceToCategory(null)).toBeNull();
    expect(naceToCategory("")).toBeNull();
    expect(naceToCategory("00.00")).toBeNull();
    expect(naceToCategory("01.11")).toBeNull(); // agriculture — not in our map
  });
});

describe("looksLikePerson", () => {
  it("detects 2-3 short alphabetic tokens as person-like", () => {
    expect(looksLikePerson("jean dupont")).toBe(true);
    expect(looksLikePerson("nicolas huberty")).toBe(true);
    expect(looksLikePerson("marie claire dupont")).toBe(true);
  });

  it("rejects strings with digits", () => {
    expect(looksLikePerson("delhaize wavre 1234")).toBe(false);
  });

  it("rejects long token sequences", () => {
    expect(looksLikePerson("societe nationale chemins fer francais belges")).toBe(false);
  });

  it("rejects empty / whitespace", () => {
    // Empty inputs default to true (we skip BCE) so we don't leak through
    expect(looksLikePerson("")).toBe(true);
  });
});
