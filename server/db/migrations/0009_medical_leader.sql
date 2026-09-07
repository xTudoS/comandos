CREATE TYPE "public"."note_status" AS ENUM('active', 'draft');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('playbook', 'credential', 'contact', 'decision', 'reference');--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"type" "note_type" DEFAULT 'reference' NOT NULL,
	"project_id" uuid,
	"status" "note_status" DEFAULT 'active' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner_user_id","archived","type");--> statement-breakpoint
CREATE INDEX "notes_project_idx" ON "notes" USING btree ("project_id");