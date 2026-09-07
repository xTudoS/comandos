ALTER TABLE "tasks" ADD COLUMN "followup_description" text;--> statement-breakpoint
UPDATE "tasks" SET "followup_description" = "people"."name"
  FROM "people"
  WHERE "tasks"."followup_holder_person_id" = "people"."id"
    AND "tasks"."followup_holder_person_id" IS NOT NULL;
