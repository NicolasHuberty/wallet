CREATE TABLE "account_cashflow" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"amount" real NOT NULL,
	"ticker" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_cashflow" ADD CONSTRAINT "account_cashflow_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_cashflow_account_id_date_idx" ON "account_cashflow" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "account_cashflow_account_id_source_idx" ON "account_cashflow" USING btree ("account_id","source");