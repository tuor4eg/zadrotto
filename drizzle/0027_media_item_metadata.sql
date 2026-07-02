CREATE TABLE "media_item_metadata" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_provider" text,
	"source_external_id" text,
	"source_url" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_item_metadata" ADD CONSTRAINT "media_item_metadata_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
