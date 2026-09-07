CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("owner_user_id","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_owner_name_lower_unique" ON "companies" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_company_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "goals_company_idx" ON "goals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tasks_company_idx" ON "tasks" USING btree ("company_id");--> statement-breakpoint
-- Backfill: each existing empresa-category project becomes a canonical company
-- entry with the same name. Owner pairs with the project's owner. Conflicts
-- on (owner, lower(name)) are skipped — pre-existing duplicates with the
-- same name share the company row.
INSERT INTO "companies" ("owner_user_id", "name")
  SELECT DISTINCT "owner_user_id", "name"
  FROM "projects"
  WHERE "category" = 'company' AND "archived" = false
ON CONFLICT ("owner_user_id", lower("name")) DO NOTHING;--> statement-breakpoint
UPDATE "projects" SET "company_id" = "companies"."id"
  FROM "companies"
  WHERE "projects"."category" = 'company'
    AND "projects"."owner_user_id" = "companies"."owner_user_id"
    AND lower("projects"."name") = lower("companies"."name");
