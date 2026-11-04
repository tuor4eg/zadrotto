ALTER TABLE "media_item_franchises"
  ADD COLUMN "created_by_author_id" integer REFERENCES "authors"("id") ON DELETE SET NULL,
  ADD COLUMN "publication_status" "publication_status" DEFAULT 'published' NOT NULL,
  ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "media_item_franchises"
SET "publication_status" = 'published', "created_by_author_id" = NULL;

CREATE INDEX "media_item_franchises_publication_status_idx"
  ON "media_item_franchises" USING btree ("publication_status");
