ALTER TABLE "account_cashflow" ADD COLUMN "transfer_to_account_id" text;--> statement-breakpoint
ALTER TABLE "category_rule" ADD COLUMN "transfer_to_account_id" text;--> statement-breakpoint
CREATE INDEX "account_cashflow_transfer_to_idx" ON "account_cashflow" USING btree ("transfer_to_account_id");