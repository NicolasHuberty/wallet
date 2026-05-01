// Belgian Crossroads Bank for Enterprises (BCE / KBO) lookup.
//
// Match a transaction's counterparty name (creditorName / debtorName from
// GoCardless) against the bulk-imported KBO open-data registry, return the
// company's NACE-BEL primary activity code, then map that code to one of
// our 22 internal categories.
//
// Lookup strategy (cheap → costly):
//   1. exact match on normalised search name
//   2. ILIKE prefix match (helps match "DELHAIZE WAVRE" → "DELHAIZE LE LION SA")
//   3. ILIKE substring match (last-resort, can produce false positives)
//
// All three rounds are bound by `limit` and only run when the previous
// round returned nothing. We never call BCE for individuals (P2P transfers,
// person-name-shaped strings) since the registry only contains companies.
//
// The reverse mapping NACE-BEL 2008 → category is hardcoded below. NACE
// codes are 5 digits (subdivision of the 4-digit ISIC + national level).
// Source: https://statbel.fgov.be/en/about-statbel/methodology/classifications/nace-bel

import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import type { TransactionCategory } from "./transaction-categorizer";

// ─────────────────────────────────────────────────────────────────────
// Name normalisation
// ─────────────────────────────────────────────────────────────────────

const LEGAL_SUFFIX_RE = new RegExp(
  // Belgian + EU common suffixes, separated by a word boundary
  "\\b(s\\.?\\s*a\\.?|n\\.?\\s*v\\.?|s\\.?\\s*p\\.?\\s*r\\.?\\s*l\\.?|s\\.?\\s*r\\.?\\s*l\\.?|" +
    "b\\.?\\s*v\\.?|" +
    "vof|comm\\s*v\\.?|cvba|scrl|scs|cv|asbl|vzw|" +
    "limited|ltd|gmbh|ag|llc|inc|co|corp|holding|group|" +
    "belgium|belgique|belgie|belgië)\\b\\.?",
  "gi",
);

const NOISE_RE = /\b(payment|paiement|debit|credit|sepa|virement|achat|purchase|tfr|dom\.|domiciliation)\b/gi;

const COUNTRY_HINT_RE = /\b(be|fr|nl|lu|de|es|it|uk|us)\b\s*$/gi;

// Strip diacritics, uppercase, drop punctuation, drop multi-spaces.
export function normalizeBceName(raw: string): string {
  if (!raw) return "";
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.toLowerCase();
  s = s.replace(LEGAL_SUFFIX_RE, " ");
  s = s.replace(NOISE_RE, " ");
  s = s.replace(COUNTRY_HINT_RE, " ");
  // Many transactions arrive with stuck IBANs / ref numbers — drop them
  s = s.replace(/\bbe\d{2}\s?\d{4}(\s?\d{4}){2,3}\b/gi, " ");
  s = s.replace(/\b\d{4,}\b/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ─────────────────────────────────────────────────────────────────────
// NACE-BEL → category mapping
// ─────────────────────────────────────────────────────────────────────
// Use 2-digit and 5-digit prefix matches. The lookup tries the 5-digit
// code first, then falls back to the 4-digit, 3-digit, and 2-digit
// "division" prefix. We map the most relevant divisions to our internal
// 22 categories.

const NACE_PREFIX_TO_CATEGORY: { prefix: string; category: TransactionCategory }[] = [
  // 47 — Retail trade except motor vehicles
  { prefix: "47.11", category: "food_groceries" }, // hypermarkets / supermarkets
  { prefix: "47.21", category: "food_groceries" }, // fruit & vegetables
  { prefix: "47.22", category: "food_groceries" }, // meat
  { prefix: "47.23", category: "food_groceries" }, // fish
  { prefix: "47.24", category: "food_groceries" }, // bread / pastry
  { prefix: "47.25", category: "food_groceries" }, // beverages
  { prefix: "47.29", category: "food_groceries" }, // other food retail
  { prefix: "47.30", category: "transport" }, // automotive fuel
  { prefix: "47.4", category: "shopping" }, // ICT, books, music, sports — usually leisure shopping
  { prefix: "47.5", category: "shopping" }, // household goods
  { prefix: "47.6", category: "leisure" }, // cultural / recreation
  { prefix: "47.71", category: "shopping" }, // clothing
  { prefix: "47.72", category: "shopping" }, // shoes / leather
  { prefix: "47.73", category: "health" }, // pharmacies
  { prefix: "47.74", category: "health" }, // medical / orthopaedic
  { prefix: "47.75", category: "shopping" }, // cosmetics
  { prefix: "47.78", category: "shopping" }, // other specialised
  { prefix: "47.81", category: "food_groceries" }, // market food stalls
  { prefix: "47.82", category: "shopping" },
  { prefix: "47.91", category: "shopping" }, // mail order / e-commerce
  { prefix: "47.99", category: "shopping" }, // non-store retail

  // 56 — Restaurants & catering
  { prefix: "56.10", category: "food_restaurant" },
  { prefix: "56.21", category: "food_restaurant" },
  { prefix: "56.29", category: "food_restaurant" },
  { prefix: "56.30", category: "food_restaurant" }, // beverage serving (cafés/bars)

  // 49 — Land transport
  { prefix: "49.10", category: "transport" }, // rail passenger (SNCB)
  { prefix: "49.20", category: "transport" },
  { prefix: "49.31", category: "transport" }, // urban / suburban (STIB / De Lijn)
  { prefix: "49.32", category: "transport" }, // taxis
  { prefix: "49.39", category: "transport" }, // other land transport
  { prefix: "49.41", category: "transport" }, // freight road
  // 50–53 air / water / post
  { prefix: "50", category: "transport" },
  { prefix: "51", category: "transport" },
  { prefix: "52", category: "transport" }, // warehousing
  { prefix: "53", category: "shopping" }, // postal — most likely deliveries

  // 35 — Energy
  { prefix: "35.11", category: "utilities" }, // electricity production
  { prefix: "35.13", category: "utilities" },
  { prefix: "35.14", category: "utilities" },
  { prefix: "35.21", category: "utilities" }, // gas
  { prefix: "35.22", category: "utilities" },
  { prefix: "35.23", category: "utilities" },
  { prefix: "35.30", category: "utilities" }, // steam / aircon
  // 36 — Water
  { prefix: "36", category: "utilities" },
  // 37 — Sewerage / waste
  { prefix: "37", category: "utilities" },
  { prefix: "38", category: "utilities" }, // waste collection
  { prefix: "39", category: "utilities" }, // remediation

  // 61 — Telecommunications
  { prefix: "61", category: "telecom_internet" },

  // 62 / 63 — IT services
  { prefix: "62", category: "subscriptions" }, // SaaS / software
  { prefix: "63", category: "subscriptions" },

  // 65 — Insurance
  { prefix: "65", category: "insurance" },

  // 64 — Financial services
  { prefix: "64.11", category: "fees_bank" }, // central banking
  { prefix: "64.19", category: "fees_bank" }, // banks
  { prefix: "64.91", category: "fees_bank" }, // financial leasing
  { prefix: "64.92", category: "fees_bank" }, // other lending
  { prefix: "64", category: "fees_bank" },
  { prefix: "66", category: "fees_bank" }, // financial auxiliary

  // 86 — Healthcare
  { prefix: "86", category: "health" },
  // 87 — Residential care
  { prefix: "87", category: "health" },
  // 75 — Veterinary
  { prefix: "75", category: "health" },

  // 84 — Public administration & defence (taxes)
  { prefix: "84.11", category: "tax" },
  { prefix: "84.13", category: "tax" },
  { prefix: "84", category: "tax" },

  // 85 — Education
  { prefix: "85", category: "education" },

  // 90–93 — Arts, entertainment, sports
  { prefix: "90", category: "leisure" },
  { prefix: "91", category: "leisure" }, // libraries / museums
  { prefix: "92", category: "leisure" }, // gambling
  { prefix: "93", category: "leisure" }, // sports / amusement

  // 55 — Accommodation
  { prefix: "55", category: "leisure" },

  // 79 — Travel agencies
  { prefix: "79", category: "leisure" },

  // 68 — Real estate
  { prefix: "68", category: "housing" },

  // 41–43 — Construction
  { prefix: "41", category: "housing" },
  { prefix: "42", category: "housing" },
  { prefix: "43", category: "housing" },

  // 81 — Building services
  { prefix: "81.21", category: "housing" }, // cleaning
  { prefix: "81.22", category: "housing" },
  { prefix: "81.29", category: "housing" },
  { prefix: "81", category: "housing" },

  // 94 — Membership orgs (NGO, churches…) ~ donations
  { prefix: "94.91", category: "donation_gift" }, // religious
  { prefix: "94.99", category: "donation_gift" }, // other
  { prefix: "94", category: "donation_gift" },

  // 95 — Repairs
  { prefix: "95", category: "shopping" },

  // 96 — Personal services (laundry, hairdresser, beauty)
  { prefix: "96.01", category: "shopping" },
  { prefix: "96.02", category: "shopping" }, // hairdresser
  { prefix: "96.04", category: "leisure" }, // wellness
  { prefix: "96", category: "shopping" },
];

export function naceToCategory(naceCode: string | null | undefined): TransactionCategory | null {
  if (!naceCode) return null;
  const normalized = naceCode.replace(/[^0-9]/g, "");
  // Try increasingly shorter prefixes (5 → 4 → 3 → 2)
  for (let len = 5; len >= 2; len--) {
    const prefix = normalized.slice(0, len);
    // The mapping table uses dotted form for clarity; normalise both sides
    const dotted = len <= 2 ? prefix : `${prefix.slice(0, 2)}.${prefix.slice(2)}`;
    const found = NACE_PREFIX_TO_CATEGORY.find(
      (m) => m.prefix === dotted || m.prefix === prefix,
    );
    if (found) return found.category;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────

export type BceMatch = {
  enterpriseNumber: string;
  denomination: string;
  commercialName: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  matchType: "exact" | "prefix" | "substring";
};

// Heuristic: if the normalised string looks like a person name (2 short
// alphabetic tokens, no obvious commercial keyword), skip BCE. The KBO
// registry only has companies.
export function looksLikePerson(normalised: string): boolean {
  if (!normalised) return true;
  const tokens = normalised.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  // All tokens are short alphabetic (no digits, no obvious abbreviations)
  return tokens.every((t) => t.length >= 2 && t.length <= 16 && /^[a-z]+$/.test(t));
}

export async function lookupCompanyByName(rawName: string): Promise<BceMatch | null> {
  const normalised = normalizeBceName(rawName);
  if (!normalised || normalised.length < 3) return null;

  // 1. Exact match
  const exact = await db
    .select()
    .from(schema.bceCompany)
    .where(eq(schema.bceCompany.searchName, normalised))
    .limit(1);
  if (exact[0]) {
    return {
      enterpriseNumber: exact[0].enterpriseNumber,
      denomination: exact[0].denomination,
      commercialName: exact[0].commercialName,
      naceCode: exact[0].naceCode,
      naceDescription: exact[0].naceDescription,
      matchType: "exact",
    };
  }

  // 2. Prefix match (avoid prefixes < 4 chars to keep noise down)
  if (normalised.length >= 4) {
    const prefix = await db
      .select()
      .from(schema.bceCompany)
      .where(sql`${schema.bceCompany.searchName} LIKE ${normalised + "%"}`)
      .limit(5);
    if (prefix.length === 1) {
      // Only trust prefix when there's exactly one company under it
      return {
        enterpriseNumber: prefix[0].enterpriseNumber,
        denomination: prefix[0].denomination,
        commercialName: prefix[0].commercialName,
        naceCode: prefix[0].naceCode,
        naceDescription: prefix[0].naceDescription,
        matchType: "prefix",
      };
    }
  }

  // 3. Substring match — only when a single token is significant (>= 6 chars)
  // and there's only one match. Reduces false positives for short brand names.
  const tokens = normalised.split(/\s+/).filter((t) => t.length >= 6);
  if (tokens.length === 1) {
    const sub = await db
      .select()
      .from(schema.bceCompany)
      .where(sql`${schema.bceCompany.searchName} LIKE ${"%" + tokens[0] + "%"}`)
      .limit(2);
    if (sub.length === 1) {
      return {
        enterpriseNumber: sub[0].enterpriseNumber,
        denomination: sub[0].denomination,
        commercialName: sub[0].commercialName,
        naceCode: sub[0].naceCode,
        naceDescription: sub[0].naceDescription,
        matchType: "substring",
      };
    }
  }

  return null;
}

// Convenience wrapper used by the sync code: returns the resolved category
// + traceability info. Returns null when nothing was matched.
export async function categorizeViaBce(rawName: string): Promise<{
  category: import("./transaction-categorizer").TransactionCategory;
  enterpriseNumber: string;
  matchType: BceMatch["matchType"];
} | null> {
  const norm = normalizeBceName(rawName);
  if (looksLikePerson(norm)) return null;
  const match = await lookupCompanyByName(rawName);
  if (!match) return null;
  const cat = naceToCategory(match.naceCode);
  if (!cat) return null;
  return {
    category: cat,
    enterpriseNumber: match.enterpriseNumber,
    matchType: match.matchType,
  };
}

// Test-only export bundle (vitest grabs these without DB)
export const __test = { naceToCategory, normalizeBceName, looksLikePerson };
