CREATE TYPE "public"."task_horizon" AS ENUM('core30', 'core60', 'core90', 'micro', 'backlog', 'hibernating');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('ceo', 'delegate', 'personal');--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"delegate_person_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"horizon" "task_horizon" DEFAULT 'core30' NOT NULL,
	"type" "task_type" DEFAULT 'ceo' NOT NULL,
	"project_id" uuid,
	"scheduled_date" date,
	"scheduled_time" time,
	"duration_minutes" integer,
	"followup_active" boolean DEFAULT false NOT NULL,
	"followup_date" date,
	"followup_holder_person_id" uuid,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_annotations" ADD CONSTRAINT "task_annotations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_annotations" ADD CONSTRAINT "task_annotations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegate_person_id_people_id_fk" FOREIGN KEY ("delegate_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_followup_holder_person_id_people_id_fk" FOREIGN KEY ("followup_holder_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_task_idx" ON "checklist_items" USING btree ("task_id","position");--> statement-breakpoint
CREATE INDEX "task_annotations_task_time_idx" ON "task_annotations" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_user_id","archived","horizon");--> statement-breakpoint
CREATE INDEX "tasks_delegate_idx" ON "tasks" USING btree ("delegate_person_id");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_idx" ON "tasks" USING btree ("scheduled_date");