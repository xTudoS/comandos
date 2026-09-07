CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'archive', 'restore', 'reassign', 'complete', 'uncomplete', 'approve', 'reject');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_user_id" uuid,
	"changes" jsonb,
	"context" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_approvals" ADD COLUMN "onboarding_session_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "device_approvals" ADD CONSTRAINT "device_approvals_onboarding_session_id_sessions_id_fk" FOREIGN KEY ("onboarding_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;