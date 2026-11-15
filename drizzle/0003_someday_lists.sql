CREATE TABLE "lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_list_id_lists_user_id_id_fk" FOREIGN KEY ("user_id","list_id") REFERENCES "public"."lists"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_id_list_id_index" ON "tasks" USING btree ("user_id","list_id");--> statement-breakpoint
INSERT INTO "lists" ("id", "user_id", "title", "position") SELECT gen_random_uuid()::text, "id", 'Inbox', 0 FROM "users" WHERE NOT EXISTS (SELECT 1 FROM "lists" WHERE "lists"."user_id" = "users"."id");
