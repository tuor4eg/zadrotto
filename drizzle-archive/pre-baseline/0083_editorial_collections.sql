CREATE TABLE "editorial_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_object_key" text,
	"publication_status" "publication_status" DEFAULT 'private' NOT NULL,
	"created_by_admin_id" integer,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "editorial_collections_title_check" CHECK (btrim("title") <> ''),
	CONSTRAINT "editorial_collections_slug_check" CHECK (btrim("slug") <> ''),
	CONSTRAINT "editorial_collections_description_length_check" CHECK ("description" is null or char_length("description") <= 10000),
	CONSTRAINT "editorial_collections_publication_status_check" CHECK ("publication_status" in ('private', 'published'))
);
--> statement-breakpoint
CREATE TABLE "editorial_collection_items" (
	"collection_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"position" integer NOT NULL,
	"editorial_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collection_items_pk" PRIMARY KEY("collection_id","media_item_id"),
	CONSTRAINT "editorial_collection_items_position_unique" UNIQUE("collection_id","position"),
	CONSTRAINT "editorial_collection_items_position_check" CHECK ("position" >= 0),
	CONSTRAINT "editorial_collection_items_comment_length_check" CHECK ("editorial_comment" is null or char_length("editorial_comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_collection_id_editorial_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."editorial_collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "editorial_collections_publication_updated_idx" ON "editorial_collections" USING btree ("publication_status","updated_at");
--> statement-breakpoint
CREATE INDEX "editorial_collection_items_media_item_id_idx" ON "editorial_collection_items" USING btree ("media_item_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "media_item_franchises_franchise_id_idx";
--> statement-breakpoint
CREATE INDEX "media_item_franchises_franchise_media_item_idx" ON "media_item_franchises" USING btree ("franchise_id","media_item_id");
