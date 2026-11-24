ALTER TABLE "users" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "week_starts_on" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_week_starts_on" CHECK ("users"."week_starts_on" in (0, 1));