CREATE TABLE "media_item_franchise_removal_requests" (
  "media_item_id" integer NOT NULL,
  "franchise_id" integer NOT NULL,
  "requested_by_author_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_item_franchise_removal_requests_pk" PRIMARY KEY("media_item_id", "franchise_id"),
  CONSTRAINT "media_item_franchise_removal_requests_link_fk" FOREIGN KEY ("media_item_id", "franchise_id") REFERENCES "media_item_franchises"("media_item_id", "franchise_id") ON DELETE cascade,
  CONSTRAINT "media_item_franchise_removal_requests_requested_by_author_id_authors_id_fk" FOREIGN KEY ("requested_by_author_id") REFERENCES "authors"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "media_item_franchise_removal_requests_author_id_idx" ON "media_item_franchise_removal_requests" USING btree ("requested_by_author_id");
