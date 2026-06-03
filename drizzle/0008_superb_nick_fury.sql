CREATE TABLE "budget_envelope" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"monthly_amount" real NOT NULL,
	"cadence" text DEFAULT 'monthly' NOT NULL,
	"occurrences_per_month" real,
	"rollover_policy" text DEFAULT 'to_savings' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"composition" text DEFAULT 'single' NOT NULL,
	"children_count" integer DEFAULT 0 NOT NULL,
	"cars_count" integer DEFAULT 0 NOT NULL,
	"city" text,
	"savings_target_mode" text DEFAULT 'max' NOT NULL,
	"savings_target_amount" real,
	"buffer_amount" real DEFAULT 0 NOT NULL,
	"default_rollover_policy" text DEFAULT 'to_savings' NOT NULL,
	"spending_account_id" text,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"planned_income" real DEFAULT 0 NOT NULL,
	"planned_fixed" real DEFAULT 0 NOT NULL,
	"planned_variable" real DEFAULT 0 NOT NULL,
	"savings_target" real DEFAULT 0 NOT NULL,
	"buffer_amount" real DEFAULT 0 NOT NULL,
	"opening_balance" real DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"actual_saved" real,
	"variance_vs_plan" real,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_event" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"cycle_id" text,
	"date" timestamp with time zone NOT NULL,
	"amount" real NOT NULL,
	"envelope_id" text,
	"charged_to_buffer" boolean DEFAULT false NOT NULL,
	"label" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"linked_cashflow_id" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "day_of_month" integer;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "frequency" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "flow_type" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "auto_confirm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_income" ADD COLUMN "day_of_month" integer;--> statement-breakpoint
ALTER TABLE "recurring_income" ADD COLUMN "is_variable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_income" ADD COLUMN "floor_amount" real;--> statement-breakpoint
ALTER TABLE "budget_envelope" ADD CONSTRAINT "budget_envelope_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_profile" ADD CONSTRAINT "financial_profile_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_profile" ADD CONSTRAINT "financial_profile_spending_account_id_account_id_fk" FOREIGN KEY ("spending_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_cycle" ADD CONSTRAINT "month_cycle_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_event" ADD CONSTRAINT "spend_event_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_event" ADD CONSTRAINT "spend_event_cycle_id_month_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."month_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_event" ADD CONSTRAINT "spend_event_envelope_id_budget_envelope_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."budget_envelope"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_envelope_household_id_idx" ON "budget_envelope" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "financial_profile_household_id_idx" ON "financial_profile" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "month_cycle_household_id_month_idx" ON "month_cycle" USING btree ("household_id","month");--> statement-breakpoint
CREATE INDEX "spend_event_household_cycle_idx" ON "spend_event" USING btree ("household_id","cycle_id");--> statement-breakpoint
CREATE INDEX "spend_event_envelope_idx" ON "spend_event" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "spend_event_date_idx" ON "spend_event" USING btree ("date");