ALTER TABLE "account_cashflow" ADD COLUMN "linked_recurring_expense_id" text;--> statement-breakpoint
ALTER TABLE "budget_envelope" ADD COLUMN "counterparty_patterns" text;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "tx_categories" text;--> statement-breakpoint
ALTER TABLE "recurring_expense" ADD COLUMN "counterparty_patterns" text;