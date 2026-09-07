CREATE TYPE "public"."life_area" AS ENUM('corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias');--> statement-breakpoint
CREATE TYPE "public"."training_level" AS ENUM('none', 'light', 'hard');--> statement-breakpoint
CREATE TABLE "life_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sleep_hours" real DEFAULT 7 NOT NULL,
	"training" "training_level" DEFAULT 'none' NOT NULL,
	"nutrition" integer DEFAULT 7 NOT NULL,
	"mood" integer DEFAULT 7 NOT NULL,
	"energy" integer DEFAULT 7 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_checkins_owner_date_uq" UNIQUE("owner_user_id","date")
);
--> statement-breakpoint
CREATE TABLE "life_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"area" "life_area" NOT NULL,
	"name" text NOT NULL,
	"value" integer DEFAULT 7 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "life_items_value_check" CHECK ("life_items"."value" >= 0 AND "life_items"."value" <= 10)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "life_area" "life_area";--> statement-breakpoint
ALTER TABLE "life_checkins" ADD CONSTRAINT "life_checkins_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_items" ADD CONSTRAINT "life_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "life_checkins_owner_idx" ON "life_checkins" USING btree ("owner_user_id","date");--> statement-breakpoint
CREATE INDEX "life_items_owner_idx" ON "life_items" USING btree ("owner_user_id","area","sort_order");