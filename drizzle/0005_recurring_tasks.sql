CREATE TABLE "task_series" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"color" text,
	"checklist" text[] DEFAULT '{}'::text[] NOT NULL,
	"every" text NOT NULL,
	"interval" integer NOT NULL,
	"weekdays" smallint[],
	"month_end" text,
	"week_starts_on" smallint NOT NULL,
	"anchor" date NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_series_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "task_series_interval" CHECK ("task_series"."interval" >= 1),
	CONSTRAINT "task_series_rule" CHECK (case "task_series"."every"
        when 'day' then "task_series"."weekdays" is null and "task_series"."month_end" is null
        when 'week' then cardinality("task_series"."weekdays") > 0 and "task_series"."month_end" is null
        when 'month' then "task_series"."weekdays" is null and "task_series"."month_end" in ('clamp', 'last', 'overflow')
        when 'year' then "task_series"."weekdays" is null and "task_series"."month_end" is null
        else false end)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "occurrence" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_series_id_task_series_user_id_id_fk" FOREIGN KEY ("user_id","series_id") REFERENCES "public"."task_series"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_occurrence_unique" UNIQUE("series_id","occurrence");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_occurrence" CHECK (("tasks"."series_id" is null) = ("tasks"."occurrence" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_occurrence" CHECK ("tasks"."deleted_at" is null or "tasks"."series_id" is not null);