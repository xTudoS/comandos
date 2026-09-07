CREATE TYPE "public"."device_approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "device_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"request_user_agent" text,
	"request_ip" "inet",
	"status" "device_approval_status" DEFAULT 'pending' NOT NULL,
	"decided_by_session_id" uuid,
	"decided_with_passkey_id" uuid,
	"decision_payload" jsonb,
	"decision_signature" "bytea",
	"decision_client_data" "bytea",
	"decision_authenticator_data" "bytea",
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_approvals" ADD CONSTRAINT "device_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_approvals" ADD CONSTRAINT "device_approvals_decided_by_session_id_sessions_id_fk" FOREIGN KEY ("decided_by_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_approvals" ADD CONSTRAINT "device_approvals_decided_with_passkey_id_passkeys_id_fk" FOREIGN KEY ("decided_with_passkey_id") REFERENCES "public"."passkeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_approvals_user_recent_idx" ON "device_approvals" USING btree ("user_id","status","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "device_approvals_pending_expiry_idx" ON "device_approvals" USING btree ("expires_at") WHERE "device_approvals"."status" = 'pending';