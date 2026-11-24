CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_task_id_position_index" ON "checklist_items" USING btree ("task_id","position");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_color" CHECK ("tasks"."color" in ('red', 'orange', 'yellow', 'green', 'blue', 'purple'));