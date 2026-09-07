-- Micro deixa de ser horizonte e vira flag; remove 'micro'/'backlog' do enum e
-- adiciona 'core7'. Remapeia as linhas existentes: micro -> core7 (+ is_micro),
-- backlog -> hibernating. Escrito à mão (o auto-gerado não remapeia os dados).
ALTER TABLE "tasks" ADD COLUMN "is_micro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "is_micro" = true WHERE "horizon" = 'micro';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "horizon" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "horizon" SET DEFAULT 'core30'::text;--> statement-breakpoint
UPDATE "tasks" SET "horizon" = 'core7' WHERE "horizon" = 'micro';--> statement-breakpoint
UPDATE "tasks" SET "horizon" = 'hibernating' WHERE "horizon" = 'backlog';--> statement-breakpoint
DROP TYPE "public"."task_horizon";--> statement-breakpoint
CREATE TYPE "public"."task_horizon" AS ENUM('core7', 'core30', 'core60', 'core90', 'hibernating');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "horizon" SET DEFAULT 'core30'::"public"."task_horizon";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "horizon" SET DATA TYPE "public"."task_horizon" USING "horizon"::"public"."task_horizon";
