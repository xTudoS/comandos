ALTER TABLE "device_approvals" DROP CONSTRAINT "device_approvals_decided_by_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "device_approvals" DROP CONSTRAINT "device_approvals_onboarding_session_id_sessions_id_fk";
