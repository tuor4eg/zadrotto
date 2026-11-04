CREATE TABLE "archive_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_title_aliases" integer DEFAULT 3 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_settings_singleton_id_check" CHECK ("archive_settings"."id" = 1),
	CONSTRAINT "archive_settings_max_title_aliases_check" CHECK ("archive_settings"."max_title_aliases" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "media_item_title_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_item_title_aliases" ADD CONSTRAINT "media_item_title_aliases_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_title_aliases_media_item_value_lower_unique_idx" ON "media_item_title_aliases" USING btree ("media_item_id", lower("value"));
--> statement-breakpoint
CREATE INDEX "media_item_title_aliases_media_item_id_idx" ON "media_item_title_aliases" USING btree ("media_item_id");
