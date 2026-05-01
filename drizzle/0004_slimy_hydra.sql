CREATE TABLE "bce_company" (
	"enterprise_number" text PRIMARY KEY NOT NULL,
	"denomination" text NOT NULL,
	"commercial_name" text,
	"search_name" text NOT NULL,
	"nace_code" text,
	"nace_description" text,
	"status" text,
	"juridical_form" text,
	"start_date" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_cashflow" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "account_cashflow" ADD COLUMN "category_source" text;--> statement-breakpoint
ALTER TABLE "account_cashflow" ADD COLUMN "bce_enterprise_number" text;--> statement-breakpoint
CREATE INDEX "bce_company_search_name_idx" ON "bce_company" USING btree ("search_name");--> statement-breakpoint
CREATE INDEX "bce_company_nace_code_idx" ON "bce_company" USING btree ("nace_code");--> statement-breakpoint
CREATE INDEX "account_cashflow_category_idx" ON "account_cashflow" USING btree ("category");