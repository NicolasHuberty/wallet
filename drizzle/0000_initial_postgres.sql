CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"institution" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"current_value" real DEFAULT 0 NOT NULL,
	"ownership" text DEFAULT 'shared' NOT NULL,
	"owner_member_id" text,
	"shared_split_pct" real,
	"annual_yield_pct" real,
	"monthly_contribution" real,
	"archived_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"value" real NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amortization_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"mortgage_id" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"payment" real NOT NULL,
	"principal" real NOT NULL,
	"interest" real NOT NULL,
	"balance" real NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_template" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"default_amount" real,
	"notes" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dca_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"ticker" text NOT NULL,
	"amount" real NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"next_date" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"isin" text,
	"allocation_pct" real,
	"quantity" real DEFAULT 0 NOT NULL,
	"avg_cost" real DEFAULT 0 NOT NULL,
	"current_price" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_template" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"default_amount" real,
	"notes" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mortgage" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"property_id" text,
	"lender" text,
	"principal" real NOT NULL,
	"interest_rate_pct" real NOT NULL,
	"term_months" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"monthly_payment" real NOT NULL,
	"remaining_balance" real NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"total_assets" real NOT NULL,
	"total_liabilities" real NOT NULL,
	"net_worth" real NOT NULL,
	"breakdown" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_off_charge" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"account_id" text,
	"property_id" text,
	"include_in_cost_basis" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_off_income" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projection_scenario" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"inflation_pct" real DEFAULT 2 NOT NULL,
	"stock_return_pct" real DEFAULT 6 NOT NULL,
	"cash_return_pct" real DEFAULT 2 NOT NULL,
	"property_appreciation_pct" real DEFAULT 2 NOT NULL,
	"horizon_years" integer DEFAULT 30 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"address" text,
	"purchase_price" real NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"current_value" real NOT NULL,
	"annual_appreciation_pct" real DEFAULT 2 NOT NULL,
	"monthly_fees" real DEFAULT 0 NOT NULL,
	"surface_sqm" real,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_expense" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"ownership" text DEFAULT 'shared' NOT NULL,
	"owner_member_id" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_expense_actual" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"month" text NOT NULL,
	"amount" real NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_income" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"ownership" text DEFAULT 'member' NOT NULL,
	"owner_member_id" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_owner_member_id_member_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshot" ADD CONSTRAINT "account_snapshot_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amortization_entry" ADD CONSTRAINT "amortization_entry_mortgage_id_mortgage_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_template" ADD CONSTRAINT "charge_template_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dca_plan" ADD CONSTRAINT "dca_plan_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding" ADD CONSTRAINT "holding_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household" ADD CONSTRAINT "household_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_template" ADD CONSTRAINT "income_template_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage" ADD CONSTRAINT "mortgage_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage" ADD CONSTRAINT "mortgage_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshot" ADD CONSTRAINT "net_worth_snapshot_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charge" ADD CONSTRAINT "one_off_charge_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charge" ADD CONSTRAINT "one_off_charge_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charge" ADD CONSTRAINT "one_off_charge_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_income" ADD CONSTRAINT "one_off_income_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_scenario" ADD CONSTRAINT "projection_scenario_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD CONSTRAINT "recurring_expense_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD CONSTRAINT "recurring_expense_owner_member_id_member_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense_actual" ADD CONSTRAINT "recurring_expense_actual_expense_id_recurring_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."recurring_expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_income" ADD CONSTRAINT "recurring_income_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_income" ADD CONSTRAINT "recurring_income_owner_member_id_member_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;