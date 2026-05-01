// Transaction categorisation cascade — orchestrator.
//
// Runs the four configured layers in priority order, returning the first
// match plus traceability. Every pass also writes the resolved category
// back into the cashflow row at the call-site.
//
//   1. user rules (category_rule)
//   2. BCE / KBO lookup (bce_company → NACE → category)
//   3. seed regex classifier
//   4. sign-based fallback (income_other / other_expense)
//
// All layers are pure-ish: rules and BCE need DB reads, regex is in-memory.
// We accept a pre-fetched rules + bce-match map so the per-row resolver
// stays cheap.

import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  classifyTransaction,
  type TransactionCategory,
} from "./transaction-categorizer";
import {
  looksLikePerson,
  naceToCategory,
  normalizeBceName,
} from "./bce";
import type { CategoryRuleMatcherType, CashflowKind } from "@/db/schema";

export type CategorizationInput = {
  amount: number;
  notes: string | null;
  counterparty: string | null;
  iban: string | null;
  kind: CashflowKind;
};

export type CategorizationOutcome = {
  category: TransactionCategory;
  source: "user_rule" | "bce" | "regex" | "fallback" | "internal_transfer";
  confidence: number; // 0..1, higher = more certain
  ruleId?: string;
  bceEnterpriseNumber?: string;
  bceMatchType?: "exact" | "prefix" | "substring";
  // Set when the cashflow is recognised as an internal transfer to another
  // household account.
  transferToAccountId?: string;
};

// Lightweight account info we need for the internal-transfer detector.
export type HouseholdAccount = { id: string; name: string; kind?: string };

// Common broker / fintech keywords. When one of these matches the
// transaction's description AND the household has an investment account
// of the corresponding kind, we treat it as an internal transfer.
const BROKER_KEYWORDS: { keyword: string; preferKinds: string[] }[] = [
  { keyword: "revolut", preferKinds: ["brokerage", "cash", "crypto"] },
  { keyword: "trade republic", preferKinds: ["brokerage"] },
  { keyword: "traderepublic", preferKinds: ["brokerage"] },
  { keyword: "degiro", preferKinds: ["brokerage"] },
  { keyword: "saxo", preferKinds: ["brokerage"] },
  { keyword: "keytrade", preferKinds: ["brokerage"] },
  { keyword: "bolero", preferKinds: ["brokerage"] },
  { keyword: "boursorama", preferKinds: ["brokerage"] },
  { keyword: "n26", preferKinds: ["cash", "savings"] },
  { keyword: "wise", preferKinds: ["cash"] },
  { keyword: "easyvest", preferKinds: ["brokerage", "retirement"] },
  { keyword: "binance", preferKinds: ["crypto"] },
  { keyword: "coinbase", preferKinds: ["crypto"] },
  { keyword: "kraken", preferKinds: ["crypto"] },
];

// Heuristic: spot transactions that look like the user is moving money
// between two of their own accounts (eg. "Compte d'épargne — To Compte
// d'épargne", "Vers Épargne", "Transfer to Trade Republic"). If we have a
// household account whose name normalises to a substring of the
// transaction's notes, return that account's id.
export function detectInternalTransfer(
  notes: string | null,
  accounts: Array<HouseholdAccount & { kind?: string }>,
  excludeAccountId?: string,
): HouseholdAccount | null {
  if (!notes || accounts.length === 0) return null;
  const norm = normalizeBceName(notes);
  if (!norm) return null;
  const lower = notes.toLowerCase();
  // Generic transfer hints — must be combined with an account-name match
  // to avoid false positives.
  const hasTransferHint =
    /(compte d epargne|d epargne|savings|spaarrek|virement|to compte|from compte|transfer to|transfer from|vers compte|depuis compte|topup|top up|top-up|deposit|d[eé]p[oô]t)/i.test(
      notes,
    );
  // First pass: exact account-name token match
  for (const acc of accounts) {
    if (excludeAccountId && acc.id === excludeAccountId) continue;
    const accNorm = normalizeBceName(acc.name);
    if (!accNorm || accNorm.length < 3) continue;
    if (norm.includes(accNorm)) return acc;
  }
  // Second pass: broker/fintech keywords matching an account of the right
  // kind. Helpful when the user named their broker account differently
  // from the brand (eg. "Wallet PEA" for a Trade Republic account).
  for (const b of BROKER_KEYWORDS) {
    if (!lower.includes(b.keyword)) continue;
    const candidate = accounts.find(
      (a) =>
        a.id !== excludeAccountId &&
        (b.preferKinds.length === 0 ||
          (a.kind && b.preferKinds.includes(a.kind))),
    );
    if (candidate) return candidate;
  }
  // Third pass: rely on the transfer-hint regex when there's only one
  // candidate account besides the source.
  if (hasTransferHint) {
    const candidates = accounts.filter((a) => a.id !== excludeAccountId);
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

// ─── User rule lookup ────────────────────────────────────────────────

export type UserRule = typeof schema.categoryRule.$inferSelect;

export function applyUserRules(
  input: CategorizationInput,
  rules: UserRule[],
): { rule: UserRule } | null {
  if (rules.length === 0) return null;
  const norm = normalizeBceName(input.counterparty ?? input.notes ?? "");
  const desc = (input.notes ?? "").toLowerCase();
  const iban = input.iban ?? "";

  // Sort by priority asc (most specific first)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    switch (r.matcherType as CategoryRuleMatcherType) {
      case "counterparty_exact":
        if (norm && norm === r.pattern) return { rule: r };
        break;
      case "counterparty_substring":
        if (norm && r.pattern && norm.includes(r.pattern)) return { rule: r };
        break;
      case "description_keyword":
        if (desc && r.pattern && desc.includes(r.pattern)) return { rule: r };
        break;
      case "iban_exact":
        if (iban && r.pattern && iban.replace(/\s/g, "") === r.pattern.replace(/\s/g, ""))
          return { rule: r };
        break;
      case "bce_enterprise":
        // Handled at sync time when bceEnterpriseNumber is already set.
        // No-op here; the resolver short-circuits before reaching this.
        break;
    }
  }
  return null;
}

// ─── BCE deep lookup (per-row, with confidence) ──────────────────────

export type BceLookupResult = {
  enterpriseNumber: string;
  denomination: string;
  naceCode: string | null;
  matchType: "exact" | "prefix" | "substring";
  confidence: number;
};

// Lower-level: query DB once for several candidate normalised names.
async function findBceCandidates(searchNames: string[]): Promise<
  Map<string, { enterpriseNumber: string; denomination: string; naceCode: string | null }>
> {
  const out = new Map<string, { enterpriseNumber: string; denomination: string; naceCode: string | null }>();
  if (searchNames.length === 0) return out;
  const rows = await db
    .select({
      enterpriseNumber: schema.bceCompany.enterpriseNumber,
      denomination: schema.bceCompany.denomination,
      naceCode: schema.bceCompany.naceCode,
      searchName: schema.bceCompany.searchName,
    })
    .from(schema.bceCompany)
    .where(inArray(schema.bceCompany.searchName, searchNames));
  for (const r of rows) {
    if (!out.has(r.searchName))
      out.set(r.searchName, {
        enterpriseNumber: r.enterpriseNumber,
        denomination: r.denomination,
        naceCode: r.naceCode,
      });
  }
  return out;
}

// Per-row: given a counterparty, find a BCE company.
// 1. Exact match on normalised name
// 2. ILIKE prefix match (longest token with ≥ 5 chars), keep when ≤ 3 candidates
// 3. ILIKE substring match (longest token), keep when ≤ 2 candidates
export async function lookupBceForRow(
  counterparty: string | null,
): Promise<BceLookupResult | null> {
  if (!counterparty) return null;
  const norm = normalizeBceName(counterparty);
  if (!norm || norm.length < 3 || looksLikePerson(norm)) return null;

  // 1. Exact match
  const exact = await db
    .select()
    .from(schema.bceCompany)
    .where(eq(schema.bceCompany.searchName, norm))
    .limit(2);
  if (exact.length === 1) {
    return {
      enterpriseNumber: exact[0].enterpriseNumber,
      denomination: exact[0].denomination,
      naceCode: exact[0].naceCode,
      matchType: "exact",
      confidence: 1,
    };
  }
  // Multiple exact: pick the one whose searchName is shortest (most specific
  // legal entity name); confidence drops a bit
  if (exact.length > 1) {
    const best = exact.sort((a, b) => a.denomination.length - b.denomination.length)[0];
    return {
      enterpriseNumber: best.enterpriseNumber,
      denomination: best.denomination,
      naceCode: best.naceCode,
      matchType: "exact",
      confidence: 0.85,
    };
  }

  // Get longest token for prefix/substring matching
  const tokens = norm.split(" ").filter((t) => t.length >= 5);
  if (tokens.length === 0) return null;
  const token = tokens.sort((a, b) => b.length - a.length)[0]; // longest

  // 2. Prefix match
  const prefix = await db
    .select()
    .from(schema.bceCompany)
    .where(sql`${schema.bceCompany.searchName} LIKE ${token + "%"}`)
    .limit(5);
  if (prefix.length === 1) {
    return {
      enterpriseNumber: prefix[0].enterpriseNumber,
      denomination: prefix[0].denomination,
      naceCode: prefix[0].naceCode,
      matchType: "prefix",
      confidence: 0.85,
    };
  }
  if (prefix.length >= 2 && prefix.length <= 3) {
    // Pick shortest denomination as canonical
    const best = prefix.sort((a, b) => a.denomination.length - b.denomination.length)[0];
    return {
      enterpriseNumber: best.enterpriseNumber,
      denomination: best.denomination,
      naceCode: best.naceCode,
      matchType: "prefix",
      confidence: 0.7,
    };
  }

  // 3. Substring match — last resort, only when token is ≥ 6 chars
  if (token.length >= 6) {
    const sub = await db
      .select()
      .from(schema.bceCompany)
      .where(sql`${schema.bceCompany.searchName} LIKE ${"%" + token + "%"}`)
      .limit(3);
    if (sub.length === 1) {
      return {
        enterpriseNumber: sub[0].enterpriseNumber,
        denomination: sub[0].denomination,
        naceCode: sub[0].naceCode,
        matchType: "substring",
        confidence: 0.65,
      };
    }
    if (sub.length === 2) {
      const best = sub.sort((a, b) => a.denomination.length - b.denomination.length)[0];
      return {
        enterpriseNumber: best.enterpriseNumber,
        denomination: best.denomination,
        naceCode: best.naceCode,
        matchType: "substring",
        confidence: 0.55,
      };
    }
  }

  return null;
}

// ─── Full cascade resolver (single transaction) ──────────────────────

export async function resolveCategorySingle(
  householdId: string,
  input: CategorizationInput,
  // Caller can pass the household's accounts upfront. When omitted we
  // fetch them so the internal-transfer detector still works.
  householdAccounts?: HouseholdAccount[],
  sourceAccountId?: string,
): Promise<CategorizationOutcome> {
  // 1. User rules
  const rules = await db
    .select()
    .from(schema.categoryRule)
    .where(eq(schema.categoryRule.householdId, householdId));
  const ruleHit = applyUserRules(input, rules);
  if (ruleHit) {
    // Bump hitCount async (don't await for latency)
    void db
      .update(schema.categoryRule)
      .set({ hitCount: ruleHit.rule.hitCount + 1, updatedAt: new Date() })
      .where(eq(schema.categoryRule.id, ruleHit.rule.id));
    return {
      category: ruleHit.rule.category as TransactionCategory,
      source: "user_rule",
      confidence: 1,
      ruleId: ruleHit.rule.id,
      transferToAccountId: ruleHit.rule.transferToAccountId ?? undefined,
    };
  }

  // 1b. Internal-transfer auto-detect
  const accounts =
    householdAccounts ??
    (await db
      .select({ id: schema.account.id, name: schema.account.name, kind: schema.account.kind })
      .from(schema.account)
      .where(eq(schema.account.householdId, householdId)));
  const internalHit = detectInternalTransfer(
    input.notes,
    accounts,
    sourceAccountId,
  );
  if (internalHit) {
    return {
      category: "transfer_internal",
      source: "internal_transfer",
      confidence: 0.9,
      transferToAccountId: internalHit.id,
    };
  }

  // 2. BCE deep lookup
  const bce = await lookupBceForRow(input.counterparty);
  if (bce && bce.naceCode) {
    const cat = naceToCategory(bce.naceCode);
    if (cat) {
      return {
        category: cat,
        source: "bce",
        confidence: bce.confidence,
        bceEnterpriseNumber: bce.enterpriseNumber,
        bceMatchType: bce.matchType,
      };
    }
  }

  // 3. Regex
  const regexCat = classifyTransaction({
    amount: input.amount,
    notes: input.notes,
    existingKind: input.kind,
  });
  if (regexCat !== "other_expense" && regexCat !== "income_other") {
    return { category: regexCat, source: "regex", confidence: 0.6 };
  }

  // 4. Fallback (sign-based)
  return {
    category: regexCat,
    source: "fallback",
    confidence: 0.2,
  };
}

// ─── Batch cascade — used by sync (~700 rows at a time) ──────────────

export async function resolveCategoriesBatchV2(
  householdId: string,
  inputs: CategorizationInput[],
  sourceAccountId?: string,
): Promise<CategorizationOutcome[]> {
  if (inputs.length === 0) return [];

  // 1. Pre-fetch user rules once
  const rules = await db
    .select()
    .from(schema.categoryRule)
    .where(eq(schema.categoryRule.householdId, householdId));

  // 1b. Pre-fetch household accounts (for internal-transfer detection)
  const householdAccounts = await db
    .select({ id: schema.account.id, name: schema.account.name, kind: schema.account.kind })
    .from(schema.account)
    .where(eq(schema.account.householdId, householdId));

  // 2. Pre-fetch BCE exact matches in batch
  const normByIndex = inputs.map((i) =>
    i.counterparty ? normalizeBceName(i.counterparty) : "",
  );
  const exactKeys = Array.from(
    new Set(
      normByIndex.filter((n) => n && n.length >= 3 && !looksLikePerson(n)),
    ),
  );
  const exactMap = await findBceCandidates(exactKeys);

  // 3. Resolve per-row, falling back to deep BCE lookup when exact missed
  const out: CategorizationOutcome[] = [];
  const ruleHitIds = new Set<string>();
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];

    // Layer 1: rules
    const r = applyUserRules(inp, rules);
    if (r) {
      ruleHitIds.add(r.rule.id);
      out.push({
        category: r.rule.category as TransactionCategory,
        source: "user_rule",
        confidence: 1,
        ruleId: r.rule.id,
        transferToAccountId: r.rule.transferToAccountId ?? undefined,
      });
      continue;
    }

    // Layer 1b: internal-transfer auto-detect (between household accounts)
    const internalHit = detectInternalTransfer(
      inp.notes,
      householdAccounts,
      sourceAccountId,
    );
    if (internalHit) {
      out.push({
        category: "transfer_internal",
        source: "internal_transfer",
        confidence: 0.9,
        transferToAccountId: internalHit.id,
      });
      continue;
    }

    // Layer 2a: batch BCE exact
    const norm = normByIndex[i];
    let outcome: CategorizationOutcome | null = null;
    if (norm) {
      const m = exactMap.get(norm);
      if (m) {
        const cat = naceToCategory(m.naceCode);
        if (cat) {
          outcome = {
            category: cat,
            source: "bce",
            confidence: 1,
            bceEnterpriseNumber: m.enterpriseNumber,
            bceMatchType: "exact",
          };
        }
      }
    }
    // Layer 2b: per-row prefix/substring
    if (!outcome && inp.counterparty) {
      const bce = await lookupBceForRow(inp.counterparty);
      if (bce && bce.naceCode) {
        const cat = naceToCategory(bce.naceCode);
        if (cat) {
          outcome = {
            category: cat,
            source: "bce",
            confidence: bce.confidence,
            bceEnterpriseNumber: bce.enterpriseNumber,
            bceMatchType: bce.matchType,
          };
        }
      }
    }
    if (outcome) {
      out.push(outcome);
      continue;
    }

    // Layer 3: regex
    const regexCat = classifyTransaction({
      amount: inp.amount,
      notes: inp.notes,
      existingKind: inp.kind,
    });
    const isFallbackBucket = regexCat === "other_expense" || regexCat === "income_other";
    out.push({
      category: regexCat,
      source: isFallbackBucket ? "fallback" : "regex",
      confidence: isFallbackBucket ? 0.2 : 0.6,
    });
  }

  // Bump rule hitCount
  if (ruleHitIds.size > 0) {
    for (const id of ruleHitIds) {
      void db
        .update(schema.categoryRule)
        .set({ hitCount: sql`${schema.categoryRule.hitCount} + 1`, updatedAt: new Date() })
        .where(eq(schema.categoryRule.id, id));
    }
  }

  return out;
}

// ─── Apply a category to many cashflows at once ──────────────────────
// Used by "applyToSimilar" UX after the user fixes one transaction.

export async function applyCategoryToSimilarCashflows(
  householdId: string,
  patternMatcher: { type: CategoryRuleMatcherType; pattern: string },
  category: TransactionCategory,
  transferToAccountId: string | null = null,
): Promise<{ updated: number }> {
  // Fetch all cashflows for the household. We filter in-memory because
  // counterparty lives inside `notes` (no separate column yet).
  const cashflows = await db
    .select({
      id: schema.accountCashflow.id,
      notes: schema.accountCashflow.notes,
      bceEnterpriseNumber: schema.accountCashflow.bceEnterpriseNumber,
    })
    .from(schema.accountCashflow)
    .innerJoin(schema.account, eq(schema.accountCashflow.accountId, schema.account.id))
    .where(eq(schema.account.householdId, householdId));

  let updated = 0;
  const now = new Date();
  for (const cf of cashflows) {
    const norm = normalizeBceName(cf.notes ?? "");
    const desc = (cf.notes ?? "").toLowerCase();
    let match = false;
    switch (patternMatcher.type) {
      case "counterparty_exact":
        match = norm === patternMatcher.pattern;
        break;
      case "counterparty_substring":
        match = !!norm && norm.includes(patternMatcher.pattern);
        break;
      case "description_keyword":
        match = !!desc && desc.includes(patternMatcher.pattern);
        break;
      case "bce_enterprise":
        match = cf.bceEnterpriseNumber === patternMatcher.pattern;
        break;
      default:
        break;
    }
    if (match) {
      await db
        .update(schema.accountCashflow)
        .set({
          category,
          categorySource: "user",
          transferToAccountId,
          updatedAt: now,
        })
        .where(eq(schema.accountCashflow.id, cf.id));
      updated++;
    }
  }
  return { updated };
}
