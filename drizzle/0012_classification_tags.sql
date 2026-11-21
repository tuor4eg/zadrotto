CREATE TABLE "classification_migration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"manifest" jsonb NOT NULL,
	"before_snapshot" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"preview_hash" text NOT NULL,
	"after_hash" text,
	"after_snapshot" jsonb,
	"created_by_admin_id" integer NOT NULL,
	"approved_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"rollback_approved_by_admin_id" integer,
	"rollback_approved_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	CONSTRAINT "classification_migration_runs_status_check" CHECK ("classification_migration_runs"."status" in ('preview','approved','applied','rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "media_item_tags" (
	"media_item_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	CONSTRAINT "media_item_tags_media_item_id_tag_id_author_id_pk" PRIMARY KEY("media_item_id","tag_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "tags_code_unique" UNIQUE("code"),
	CONSTRAINT "tags_title_check" CHECK (char_length(btrim("tags"."title")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD COLUMN "tag_publication_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "genres" ADD COLUMN "replacement_tag_id" integer;--> statement-breakpoint
ALTER TABLE "media_item_tags" ADD CONSTRAINT "media_item_tags_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_tags" ADD CONSTRAINT "media_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_tags" ADD CONSTRAINT "media_item_tags_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_item_tags_tag_media_author_idx" ON "media_item_tags" USING btree ("tag_id","media_item_id","author_id");--> statement-breakpoint
CREATE INDEX "media_item_tags_author_idx" ON "media_item_tags" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_normalized_title_unique" ON "tags" USING btree (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е'));--> statement-breakpoint
CREATE INDEX "tags_title_search_idx" ON "tags" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_replacement_tag_id_tags_id_fk" FOREIGN KEY ("replacement_tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "genres_replacement_tag_id_idx" ON "genres" USING btree ("replacement_tag_id");--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_tag_publication_threshold_check" CHECK ("archive_settings"."tag_publication_threshold" >= 1);--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_single_replacement_check" CHECK ("genres"."replacement_franchise_id" is null or "genres"."replacement_tag_id" is null);