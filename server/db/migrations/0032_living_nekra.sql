ALTER TYPE "public"."booking_request_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "requester_token_hash" text;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "requester_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "requester_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_requester_token_hash_unique" UNIQUE("requester_token_hash");