import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid(12));
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
};

// ────────────────────────────────────────────────────────────────────
// better-auth tables
// ────────────────────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ────────────────────────────────────────────────────────────────────
// Business domain tables
// ────────────────────────────────────────────────────────────────────

export const household = pgTable(
  "household",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull().default("EUR"),
    ...timestamps,
  },
  (t) => [index("household_user_id_idx").on(t.userId)],
);

export const member = pgTable(
  "member",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    color: text("color").notNull().default("#6366f1"),
    ...timestamps,
  },
  (t) => [index("member_household_id_idx").on(t.householdId)],
);

export const accountKind = [
  "cash",
  "savings",
  "brokerage",
  "retirement",
  "real_estate",
  "loan",
  "credit_card",
  "crypto",
  "other_asset",
] as const;
export type AccountKind = (typeof accountKind)[number];

export const ownership = ["shared", "member"] as const;

export const account = pgTable(
  "account",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: accountKind }).notNull(),
    institution: text("institution"),
    currency: text("currency").notNull().default("EUR"),
    currentValue: real("current_value").notNull().default(0),
    ownership: text("ownership", { enum: ownership }).notNull().default("shared"),
    ownerMemberId: text("owner_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    sharedSplitPct: real("shared_split_pct"),
    annualYieldPct: real("annual_yield_pct"),
    monthlyContribution: real("monthly_contribution"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    notes: text("notes"),
    // GoCardless / open-banking link. When set, the account is auto-synced
    // from the bank instead of being manually edited.
    goCardlessAccountId: text("gocardless_account_id"),
    bankConnectionId: text("bank_connection_id"),
    lastBankSyncAt: timestamp("last_bank_sync_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("account_household_id_idx").on(t.householdId),
    index("account_gocardless_id_idx").on(t.goCardlessAccountId),
  ],
);

export const holding = pgTable(
  "holding",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    name: text("name"),
    isin: text("isin"),
    allocationPct: real("allocation_pct"),
    quantity: real("quantity").notNull().default(0),
    avgCost: real("avg_cost").notNull().default(0),
    currentPrice: real("current_price").notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    ...timestamps,
  },
  (t) => [index("holding_account_id_idx").on(t.accountId)],
);

export const dcaFrequency = ["weekly", "biweekly", "monthly", "quarterly"] as const;

export const dcaPlan = pgTable(
  "dca_plan",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    amount: real("amount").notNull(),
    frequency: text("frequency", { enum: dcaFrequency }).notNull().default("monthly"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    nextDate: timestamp("next_date", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("dca_plan_account_id_idx").on(t.accountId)],
);

export const property = pgTable(
  "property",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    address: text("address"),
    purchasePrice: real("purchase_price").notNull(),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull(),
    currentValue: real("current_value").notNull(),
    annualAppreciationPct: real("annual_appreciation_pct").notNull().default(2),
    monthlyFees: real("monthly_fees").notNull().default(0),
    surfaceSqm: real("surface_sqm"),
    ...timestamps,
  },
  (t) => [index("property_account_id_idx").on(t.accountId)],
);

export const mortgage = pgTable(
  "mortgage",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    propertyId: text("property_id").references(() => property.id, { onDelete: "set null" }),
    lender: text("lender"),
    principal: real("principal").notNull(),
    interestRatePct: real("interest_rate_pct").notNull(),
    termMonths: integer("term_months").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    monthlyPayment: real("monthly_payment").notNull(),
    remainingBalance: real("remaining_balance").notNull(),
    ...timestamps,
  },
  (t) => [
    index("mortgage_account_id_idx").on(t.accountId),
    index("mortgage_property_id_idx").on(t.propertyId),
  ],
);

export const amortizationEntry = pgTable(
  "amortization_entry",
  {
    id: id(),
    mortgageId: text("mortgage_id")
      .notNull()
      .references(() => mortgage.id, { onDelete: "cascade" }),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    payment: real("payment").notNull(),
    principal: real("principal").notNull(),
    interest: real("interest").notNull(),
    balance: real("balance").notNull(),
    ...timestamps,
  },
  (t) => [index("amortization_entry_mortgage_id_due_date_idx").on(t.mortgageId, t.dueDate)],
);

export const expenseCategory = [
  "housing",
  "utilities",
  "food",
  "transport",
  "insurance",
  "subscriptions",
  "leisure",
  "health",
  "childcare",
  "taxes",
  "other",
] as const;

// Cash-flow ("Cap") — recurrence cadence for a dated flow. Extends dcaFrequency
// with a yearly option (some insurances are billed once a year).
export const flowFrequency = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type FlowFrequency = (typeof flowFrequency)[number];

// Cash-flow — nature of a recurring expense. "fixed" = deterministic dated
// commitment (rent, subscription) auto-deducted without user input; "variable"
// = drives a budget envelope confirmed by the user (kept here for completeness
// though most variable spend lives in the budgetEnvelope table).
export const flowType = ["fixed", "variable"] as const;
export type FlowType = (typeof flowType)[number];

export const recurringExpense = pgTable(
  "recurring_expense",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // Free-text category: presets (expenseCategory) or user-defined string.
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    ownership: text("ownership", { enum: ownership }).notNull().default("shared"),
    ownerMemberId: text("owner_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    notes: text("notes"),
    // ── Cash-flow ("Cap") fields ──────────────────────────────────────
    // Day of month (1..31) the flow occurs on. Clamped to the last day of
    // short months at expansion time. NULL = legacy/undated expense.
    dayOfMonth: integer("day_of_month"),
    frequency: text("frequency", { enum: flowFrequency }).notNull().default("monthly"),
    flowType: text("flow_type", { enum: flowType }).notNull().default("fixed"),
    // Paused without deletion (e.g. cancelled subscription, holiday month).
    active: boolean("active").notNull().default(true),
    // Fixed dated flows are deducted from Safe-to-Spend without a confirmation tap.
    autoConfirm: boolean("auto_confirm").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("recurring_expense_household_id_idx").on(t.householdId)],
);

// Per-month actual amount logged at each check-in for a recurring expense.
export const recurringExpenseActual = pgTable(
  "recurring_expense_actual",
  {
    id: id(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => recurringExpense.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    amount: real("amount").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("recurring_expense_actual_expense_id_month_idx").on(t.expenseId, t.month),
    index("recurring_expense_actual_month_idx").on(t.month),
  ],
);

export const incomeCategory = ["salary", "freelance", "dividends", "rent", "other"] as const;

export const recurringIncome = pgTable(
  "recurring_income",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    ownership: text("ownership", { enum: ownership }).notNull().default("member"),
    ownerMemberId: text("owner_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    notes: text("notes"),
    // ── Cash-flow ("Cap") fields ──────────────────────────────────────
    // Day of month the income is paid (e.g. 28). NULL = undated/legacy.
    dayOfMonth: integer("day_of_month"),
    // Variable income (freelance, bonuses): Safe-to-Spend runs on floorAmount,
    // the surplus overflows to savings when actually received.
    isVariable: boolean("is_variable").notNull().default(false),
    floorAmount: real("floor_amount"),
    ...timestamps,
  },
  (t) => [index("recurring_income_household_id_idx").on(t.householdId)],
);

// Catégories pour revenus exceptionnels (one-off)
export const oneOffIncomeCategory = [
  "bonus",
  "freelance",
  "gift",
  "refund",
  "tax_refund",
  "dividend",
  "sale",
  "inheritance",
  "other",
] as const;
export type OneOffIncomeCategory = (typeof oneOffIncomeCategory)[number];

export const oneOffIncome = pgTable(
  "one_off_income",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("one_off_income_household_id_date_idx").on(t.householdId, t.date)],
);

export const incomeTemplate = pgTable(
  "income_template",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    category: text("category").notNull(),
    defaultAmount: real("default_amount"),
    notes: text("notes"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("income_template_household_id_idx").on(t.householdId)],
);

export const chargeCategory = [
  "notary",
  "registration_tax",
  "credit_fees",
  "expertise",
  "mortgage_insurance",
  "renovation",
  "furniture",
  "moving",
  "inheritance_tax",
  "legal",
  "tax",
  "other",
] as const;
export type ChargeCategory = (typeof chargeCategory)[number];

export const oneOffCharge = pgTable(
  "one_off_charge",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    label: text("label").notNull(),
    // Free-text category: presets (chargeCategory) or user-defined string.
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    accountId: text("account_id").references(() => account.id, { onDelete: "set null" }),
    propertyId: text("property_id").references(() => property.id, { onDelete: "set null" }),
    includeInCostBasis: boolean("include_in_cost_basis").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("one_off_charge_household_id_date_idx").on(t.householdId, t.date),
    index("one_off_charge_property_id_idx").on(t.propertyId),
  ],
);

// Reusable one-off charge template (so the user can re-create common items easily).
export const chargeTemplate = pgTable(
  "charge_template",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    category: text("category").notNull(),
    defaultAmount: real("default_amount"),
    notes: text("notes"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("charge_template_household_id_idx").on(t.householdId)],
);

export const oneOffChargeRelations = relations(oneOffCharge, ({ one }) => ({
  household: one(household, {
    fields: [oneOffCharge.householdId],
    references: [household.id],
  }),
  account: one(account, {
    fields: [oneOffCharge.accountId],
    references: [account.id],
  }),
  property: one(property, {
    fields: [oneOffCharge.propertyId],
    references: [property.id],
  }),
}));

export const accountSnapshot = pgTable(
  "account_snapshot",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    value: real("value").notNull(),
    ...timestamps,
  },
  (t) => [index("account_snapshot_account_id_date_idx").on(t.accountId, t.date)],
);

// External cash flows on an account (deposits / withdrawals / dividends /
// fees / buys / sells). Used to compute time-weighted return (TWR), money-
// weighted return (XIRR) and net deposits — i.e. performance metrics that are
// independent of the user's own contributions. Source distinguishes import-
// generated rows (idempotent re-import = delete-then-insert by source) from
// manually entered ones.
export const cashflowKind = [
  "deposit",
  "withdrawal",
  "dividend",
  "fee",
  "interest",
  "buy",
  "sell",
  "transfer_in",
  "transfer_out",
  "other",
] as const;
export type CashflowKind = (typeof cashflowKind)[number];

export const cashflowSource = [
  "revolut_import",
  "manual",
  "checkin",
  "bank_sync",
] as const;
export type CashflowSource = (typeof cashflowSource)[number];

export const accountCashflow = pgTable(
  "account_cashflow",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    kind: text("kind", { enum: cashflowKind }).notNull(),
    // Signed amount. Positive = cash flowed INTO the account from outside (or
    // realized profit); negative = cash left the account. For BUY/SELL events
    // we store the absolute amount with sign matching the cash impact:
    // BUY = negative (cash out of account into a position), SELL = positive.
    amount: real("amount").notNull(),
    ticker: text("ticker"),
    notes: text("notes"),
    source: text("source", { enum: cashflowSource }).notNull().default("manual"),
    // Provider-side ID for de-duplication on re-sync (eg. GoCardless
    // transactionId, Revolut transaction ref).
    externalId: text("external_id"),
    // Resolved transaction category — populated at sync time by the
    // categorisation cascade (user rules → BCE/NACE → seed regex →
    // fallback). NULL = not classified yet (e.g. legacy rows). The
    // analytics panel reads this column rather than re-running the
    // classifier on every page render.
    category: text("category"),
    // When category was assigned via BCE lookup, store the matched
    // enterprise number for traceability (and to invalidate when the
    // user overrides the category manually).
    categorySource: text("category_source"), // 'user' | 'bce' | 'regex' | 'fallback'
    bceEnterpriseNumber: text("bce_enterprise_number"),
    // Set when this cashflow is an internal transfer to/from another
    // account in the same household. Excluded from "real" income/expense
    // analytics (it's just moving money around). FK with SET NULL so
    // deleting the target account leaves the cashflow but unlinks it.
    transferToAccountId: text("transfer_to_account_id"),
    // Optional link to a one-shot charge (eg. notary fees, registration
    // tax, expertise) that the user pre-recorded. Once linked the
    // cashflow inherits the charge's category and sourcing.
    linkedOneOffChargeId: text("linked_one_off_charge_id"),
    // For salary-like income, the specific recurringIncome row this
    // payment corresponds to (when the household has multiple salaries).
    linkedRecurringIncomeId: text("linked_recurring_income_id"),
    ...timestamps,
  },
  (t) => [
    index("account_cashflow_account_id_date_idx").on(t.accountId, t.date),
    index("account_cashflow_account_id_source_idx").on(t.accountId, t.source),
    index("account_cashflow_external_id_idx").on(t.externalId),
    index("account_cashflow_category_idx").on(t.category),
    index("account_cashflow_transfer_to_idx").on(t.transferToAccountId),
  ],
);

// User-defined categorisation rules — the "feedback loop" that captures
// each manual override the user does. On every (re-)categorisation pass we
// apply rules in priority order BEFORE BCE / regex / fallback layers. Rules
// are scoped to a household.
//
// matcherType:
//  - 'counterparty_exact'      pattern matches normalised counterparty name
//  - 'counterparty_substring'  pattern is a substring of normalised cp
//  - 'description_keyword'     pattern is found anywhere in lowercase notes
//  - 'iban_exact'              pattern equals the counterparty IBAN
//  - 'bce_enterprise'          pattern is a BCE enterprise number (10 digits)
export const categoryRuleMatcherType = [
  "counterparty_exact",
  "counterparty_substring",
  "description_keyword",
  "iban_exact",
  "bce_enterprise",
] as const;
export type CategoryRuleMatcherType = (typeof categoryRuleMatcherType)[number];

export const categoryRule = pgTable(
  "category_rule",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    matcherType: text("matcher_type", { enum: categoryRuleMatcherType }).notNull(),
    pattern: text("pattern").notNull(), // already normalised (lowercase, no diacritics)
    category: text("category").notNull(),
    // Lower number = higher priority. Exact rules default 10, substrings 50.
    priority: integer("priority").notNull().default(50),
    // How many cashflows the rule has matched so far (incremented at apply
    // time). Used to surface "your most-used rules" in the rules manager.
    hitCount: integer("hit_count").notNull().default(0),
    // Set when the rule classifies its matches as an internal transfer to
    // another account in the household. Saves the user from re-picking the
    // target every time. NULL → standard category-only rule.
    transferToAccountId: text("transfer_to_account_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("category_rule_household_id_idx").on(t.householdId),
    index("category_rule_household_pattern_idx").on(t.householdId, t.matcherType, t.pattern),
  ],
);

// Belgian Crossroads Bank for Enterprises (BCE / KBO) — bulk-imported
// monthly CSV dump from https://kbopub.economie.fgov.be/kbo-open-data/.
// Used to look up the NACE-BEL activity code of a transaction's
// counterparty, which we map to one of our internal categories. Only
// covers Belgian-registered companies; international merchants fall
// through to the regex layer.
export const bceCompany = pgTable(
  "bce_company",
  {
    // Normalised enterprise number, eg. "0123456789" (10 digits, no dots).
    enterpriseNumber: text("enterprise_number").primaryKey(),
    // Legal name as in the registry.
    denomination: text("denomination").notNull(),
    // Commercial / trade name when distinct from the legal name.
    commercialName: text("commercial_name"),
    // Lowercase, ASCII-folded, punctuation-stripped, generic-suffix-stripped
    // version of the legal name — used for fuzzy lookup against transaction
    // counterparty names.
    searchName: text("search_name").notNull(),
    // Primary NACE-BEL 2008 code (5 digits, eg. "47110").
    naceCode: text("nace_code"),
    // Human-readable label of the NACE activity (FR/NL/EN, whichever
    // available in the dump).
    naceDescription: text("nace_description"),
    status: text("status"),
    juridicalForm: text("juridical_form"),
    startDate: timestamp("start_date", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bce_company_search_name_idx").on(t.searchName),
    index("bce_company_nace_code_idx").on(t.naceCode),
  ],
);

// One row per GoCardless requisition (bank connection). PSD2-mandated
// re-consent at most every 90 days, so each connection has an `expiresAt`.
export const bankConnectionStatus = ["pending", "active", "expired", "error"] as const;

export const bankConnection = pgTable(
  "bank_connection",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    institutionId: text("institution_id").notNull(),
    institutionName: text("institution_name").notNull(),
    institutionLogo: text("institution_logo"),
    requisitionId: text("requisition_id").notNull().unique(),
    agreementId: text("agreement_id"),
    // Free-form reference we set when creating the requisition so we can
    // recognise the user on the OAuth callback even before we know the
    // requisition_id (the GoCardless redirect only sends `?ref=`).
    reference: text("reference").notNull().unique(),
    status: text("status", { enum: bankConnectionStatus }).notNull().default("pending"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("bank_connection_household_id_idx").on(t.householdId)],
);

export const netWorthSnapshot = pgTable(
  "net_worth_snapshot",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    totalAssets: real("total_assets").notNull(),
    totalLiabilities: real("total_liabilities").notNull(),
    netWorth: real("net_worth").notNull(),
    breakdown: text("breakdown"),
    ...timestamps,
  },
  (t) => [index("net_worth_snapshot_household_id_date_idx").on(t.householdId, t.date)],
);

export const projectionScenario = pgTable(
  "projection_scenario",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    inflationPct: real("inflation_pct").notNull().default(2),
    stockReturnPct: real("stock_return_pct").notNull().default(6),
    cashReturnPct: real("cash_return_pct").notNull().default(2),
    propertyAppreciationPct: real("property_appreciation_pct").notNull().default(2),
    horizonYears: integer("horizon_years").notNull().default(30),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("projection_scenario_household_id_idx").on(t.householdId)],
);

// ────────────────────────────────────────────────────────────────────
// Cash-flow ("Cap") — predictive Safe-to-Spend engine
// ────────────────────────────────────────────────────────────────────

// One row per household. Output of the onboarding "concierge" + global
// cash-flow settings.
export const profileComposition = ["single", "couple"] as const;
export type ProfileComposition = (typeof profileComposition)[number];
export const savingsTargetMode = ["fixed", "max"] as const;
export type SavingsTargetMode = (typeof savingsTargetMode)[number];

export const financialProfile = pgTable(
  "financial_profile",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    composition: text("composition", { enum: profileComposition })
      .notNull()
      .default("single"),
    childrenCount: integer("children_count").notNull().default(0),
    carsCount: integer("cars_count").notNull().default(0),
    city: text("city"),
    // Savings objective.
    savingsTargetMode: text("savings_target_mode", { enum: savingsTargetMode })
      .notNull()
      .default("max"),
    savingsTargetAmount: real("savings_target_amount"),
    // Monthly buffer reserved for the unexpected.
    bufferAmount: real("buffer_amount").notNull().default(0),
    // Default destination for end-of-period overflow.
    defaultRolloverPolicy: text("default_rollover_policy", { enum: ["to_savings", "accumulate", "reset"] })
      .notNull()
      .default("to_savings"),
    // Which account holds the "everyday spending" balance the engine reads.
    spendingAccountId: text("spending_account_id").references(() => account.id, {
      onDelete: "set null",
    }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("financial_profile_household_id_idx").on(t.householdId)],
);

export const envelopeCadence = ["weekly", "biweekly", "monthly", "per_occurrence"] as const;
export type EnvelopeCadence = (typeof envelopeCadence)[number];

export const rolloverPolicy = ["to_savings", "accumulate", "reset"] as const;
export type RolloverPolicy = (typeof rolloverPolicy)[number];

// A variable, frequency-based spending category (groceries, bar, fuel…).
export const budgetEnvelope = pgTable(
  "budget_envelope",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // Free-text category: presets (expenseCategory) or user-defined string.
    category: text("category").notNull(),
    // Cash-flow : catégories de transaction (valeurs `transactionCategory`) que
    // cette enveloppe absorbe, stockées en JSON (ex. '["food_groceries"]').
    // Source de vérité du routage transaction → enveloppe. NULL/vide = repli sur
    // l'heuristique de libellé + la correspondance grossière par catégorie.
    txCategories: text("tx_categories"),
    // Monthly envelope amount (computed from unit cost × cadence at setup).
    monthlyAmount: real("monthly_amount").notNull(),
    cadence: text("cadence", { enum: envelopeCadence }).notNull().default("monthly"),
    // Expected occurrences per month (e.g. 3 bar nights; ~4.33 if weekly).
    occurrencesPerMonth: real("occurrences_per_month"),
    rolloverPolicy: text("rollover_policy", { enum: rolloverPolicy })
      .notNull()
      .default("to_savings"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("budget_envelope_household_id_idx").on(t.householdId)],
);

export const cycleStatus = ["open", "closed"] as const;
export type CycleStatus = (typeof cycleStatus)[number];

// The frozen state of one month: the plan at opening, the result at closing.
export const monthCycle = pgTable(
  "month_cycle",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    status: text("status", { enum: cycleStatus }).notNull().default("open"),
    // Plan frozen at opening (to compare plan vs actual at close).
    plannedIncome: real("planned_income").notNull().default(0),
    plannedFixed: real("planned_fixed").notNull().default(0),
    plannedVariable: real("planned_variable").notNull().default(0),
    savingsTarget: real("savings_target").notNull().default(0),
    bufferAmount: real("buffer_amount").notNull().default(0),
    openingBalance: real("opening_balance").notNull().default(0),
    // Result frozen at closing.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    actualSaved: real("actual_saved"),
    varianceVsPlan: real("variance_vs_plan"),
    ...timestamps,
  },
  (t) => [index("month_cycle_household_id_month_idx").on(t.householdId, t.month)],
);

export const spendSource = ["manual", "auto_cadence", "bank_sync", "rollover"] as const;
export type SpendSource = (typeof spendSource)[number];

// A confirmed variable spend (the 1-click confirmation) or unexpected charge.
export const spendEvent = pgTable(
  "spend_event",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").references(() => monthCycle.id, { onDelete: "set null" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    amount: real("amount").notNull(), // positive = spend
    envelopeId: text("envelope_id").references(() => budgetEnvelope.id, {
      onDelete: "set null",
    }),
    // When true the spend is charged to the buffer rather than an envelope.
    chargedToBuffer: boolean("charged_to_buffer").notNull().default(false),
    label: text("label"),
    source: text("source", { enum: spendSource }).notNull().default("manual"),
    // Optional link to a real bank cashflow (bank-sync mode) for reconciliation.
    linkedCashflowId: text("linked_cashflow_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("spend_event_household_cycle_idx").on(t.householdId, t.cycleId),
    index("spend_event_envelope_idx").on(t.envelopeId),
    index("spend_event_date_idx").on(t.date),
  ],
);

export const householdRelations = relations(household, ({ one, many }) => ({
  members: many(member),
  accounts: many(account),
  recurringExpenses: many(recurringExpense),
  recurringIncomes: many(recurringIncome),
  projections: many(projectionScenario),
  financialProfile: one(financialProfile, {
    fields: [household.id],
    references: [financialProfile.householdId],
  }),
  budgetEnvelopes: many(budgetEnvelope),
  monthCycles: many(monthCycle),
  spendEvents: many(spendEvent),
}));

export const financialProfileRelations = relations(financialProfile, ({ one }) => ({
  household: one(household, {
    fields: [financialProfile.householdId],
    references: [household.id],
  }),
}));

export const budgetEnvelopeRelations = relations(budgetEnvelope, ({ one, many }) => ({
  household: one(household, {
    fields: [budgetEnvelope.householdId],
    references: [household.id],
  }),
  spendEvents: many(spendEvent),
}));

export const monthCycleRelations = relations(monthCycle, ({ one, many }) => ({
  household: one(household, {
    fields: [monthCycle.householdId],
    references: [household.id],
  }),
  spendEvents: many(spendEvent),
}));

export const spendEventRelations = relations(spendEvent, ({ one }) => ({
  household: one(household, {
    fields: [spendEvent.householdId],
    references: [household.id],
  }),
  cycle: one(monthCycle, {
    fields: [spendEvent.cycleId],
    references: [monthCycle.id],
  }),
  envelope: one(budgetEnvelope, {
    fields: [spendEvent.envelopeId],
    references: [budgetEnvelope.id],
  }),
}));

export const accountRelations = relations(account, ({ one, many }) => ({
  household: one(household, {
    fields: [account.householdId],
    references: [household.id],
  }),
  ownerMember: one(member, {
    fields: [account.ownerMemberId],
    references: [member.id],
  }),
  holdings: many(holding),
  dcaPlans: many(dcaPlan),
  property: one(property, {
    fields: [account.id],
    references: [property.accountId],
  }),
  mortgage: one(mortgage, {
    fields: [account.id],
    references: [mortgage.accountId],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  household: one(household, {
    fields: [member.householdId],
    references: [household.id],
  }),
}));

export const holdingRelations = relations(holding, ({ one }) => ({
  account: one(account, {
    fields: [holding.accountId],
    references: [account.id],
  }),
}));

export const dcaPlanRelations = relations(dcaPlan, ({ one }) => ({
  account: one(account, {
    fields: [dcaPlan.accountId],
    references: [account.id],
  }),
}));

export const propertyRelations = relations(property, ({ one }) => ({
  account: one(account, {
    fields: [property.accountId],
    references: [account.id],
  }),
}));

export const mortgageRelations = relations(mortgage, ({ one, many }) => ({
  account: one(account, {
    fields: [mortgage.accountId],
    references: [account.id],
  }),
  property: one(property, {
    fields: [mortgage.propertyId],
    references: [property.id],
  }),
  entries: many(amortizationEntry),
}));
