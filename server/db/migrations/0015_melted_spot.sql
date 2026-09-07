-- Reconcile tasks that violate the upcoming XOR constraint: when a task has
-- both a project AND a goal, drop the goal — projects can themselves point at
-- a goal, so the link is preserved transitively without duplicating it.
UPDATE "tasks" SET "goal_id" = NULL
  WHERE "project_id" IS NOT NULL AND "goal_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_xor_goal_check" CHECK ("tasks"."project_id" IS NULL OR "tasks"."goal_id" IS NULL);
