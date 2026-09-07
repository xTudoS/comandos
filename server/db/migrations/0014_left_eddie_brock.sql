CREATE TYPE "public"."payment_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."payment_recurrence" AS ENUM('none', 'weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
UPDATE "payments" SET "due_date" = CURRENT_DATE WHERE "due_date" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "due_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" "payment_kind" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recurrence" "payment_recurrence" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recurrence_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recurrence_parent_fk" FOREIGN KEY ("recurrence_parent_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_kind_idx" ON "payments" USING btree ("owner_user_id","kind");--> statement-breakpoint
CREATE INDEX "payments_recurrence_idx" ON "payments" USING btree ("recurrence_parent_id");
