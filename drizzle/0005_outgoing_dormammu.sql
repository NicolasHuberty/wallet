CREATE TABLE "category_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"matcher_type" text NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_rule" ADD CONSTRAINT "category_rule_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_rule_household_id_idx" ON "category_rule" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "category_rule_household_pattern_idx" ON "category_rule" USING btree ("household_id","matcher_type","pattern");