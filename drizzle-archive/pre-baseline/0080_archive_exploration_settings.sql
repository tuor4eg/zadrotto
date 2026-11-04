CREATE TABLE "author_archive_exploration_settings" (
	"author_id" integer PRIMARY KEY NOT NULL,
	"auto_show_enabled" boolean DEFAULT true NOT NULL,
	"last_auto_shown_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "author_archive_exploration_settings" ADD CONSTRAINT "author_archive_exploration_settings_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
