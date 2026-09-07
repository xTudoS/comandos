ALTER TABLE "device_approvals" ALTER COLUMN "decision_signature" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "device_approvals" ALTER COLUMN "decision_client_data" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "device_approvals" ALTER COLUMN "decision_authenticator_data" SET DATA TYPE text;