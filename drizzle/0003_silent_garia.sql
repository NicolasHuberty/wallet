CREATE TABLE "bank_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"institution_logo" text,
	"requisition_id" text NOT NULL,
	"agreement_id" text,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bank_connection_requisition_id_unique" UNIQUE("requisition_id"),
	CONSTRAINT "bank_connection_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "gocardless_account_id" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "bank_connection_id" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "last_bank_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_cashflow" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD CONSTRAINT "bank_connection_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_connection_household_id_idx" ON "bank_connection" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "account_gocardless_id_idx" ON "account" USING btree ("gocardless_account_id");--> statement-breakpoint
CREATE INDEX "account_cashflow_external_id_idx" ON "account_cashflow" USING btree ("external_id");