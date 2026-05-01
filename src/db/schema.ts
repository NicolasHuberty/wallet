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
    ...timestamps,
  },
  (t) => [index("account_household_id_idx").on(t.householdId)],
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

export const cashflowSource = ["revolut_import", "manual", "checkin"] as const;
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
    ...timestamps,
  },
  (t) => [
    index("account_cashflow_account_id_date_idx").on(t.accountId, t.date),
    index("account_cashflow_account_id_source_idx").on(t.accountId, t.source),
  ],
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

export const householdRelations = relations(household, ({ many }) => ({
  members: many(member),
  accounts: many(account),
  recurringExpenses: many(recurringExpense),
  recurringIncomes: many(recurringIncome),
  projections: many(projectionScenario),
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
