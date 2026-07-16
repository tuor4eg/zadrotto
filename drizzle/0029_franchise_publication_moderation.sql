ALTER TABLE "franchises"
  ADD COLUMN "created_by_author_id" integer REFERENCES "authors"("id") ON DELETE SET NULL,
  ADD COLUMN "publication_status" "publication_status" DEFAULT 'published' NOT NULL;

CREATE INDEX "franchises_created_by_author_id_idx"
  ON "franchises" USING btree ("created_by_author_id");
CREATE INDEX "franchises_publication_status_idx"
  ON "franchises" USING btree ("publication_status");

ALTER TABLE "author_access_profiles"
  ADD COLUMN "can_publish_franchises_without_review" boolean DEFAULT false NOT NULL;

UPDATE "author_access_profiles"
SET "can_publish_franchises_without_review" = "can_publish_media_without_review";
