CREATE TABLE "import_history" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_tasks" integer NOT NULL,
	"added_lists" integer NOT NULL,
	"empty_records" integer NOT NULL,
	CONSTRAINT "import_history_user_id_fingerprint_pk" PRIMARY KEY("user_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;