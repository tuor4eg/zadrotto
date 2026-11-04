CREATE TABLE "author_media_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_media_statuses_author_media_unique" UNIQUE("author_id","media_item_id"),
	CONSTRAINT "author_media_statuses_status_check" CHECK ("author_media_statuses"."status" in ('wanted', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "author_media_statuses" ADD CONSTRAINT "author_media_statuses_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "author_media_statuses" ADD CONSTRAINT "author_media_statuses_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "author_media_statuses_author_status_idx" ON "author_media_statuses" USING btree ("author_id","status");
--> statement-breakpoint
CREATE INDEX "author_media_statuses_media_item_id_idx" ON "author_media_statuses" USING btree ("media_item_id");
