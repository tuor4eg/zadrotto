ALTER TABLE "editorial_document_blocks" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "editorial_document_blocks" DROP CONSTRAINT "editorial_document_blocks_shape_check";
--> statement-breakpoint
-- Drizzle can apply 0110 and 0111 in one transaction. Compare the new value as
-- text, without casting an uncommitted enum label to the enum type.
ALTER TABLE "editorial_document_blocks" ADD CONSTRAINT "editorial_document_blocks_shape_check" CHECK (
  (
    "title" IS NULL AND (
      ("block_type" = 'media' AND "media_item_id" IS NOT NULL AND ("content" IS NULL OR char_length("content") <= 1000))
      OR ("block_type" = 'heading' AND "media_item_id" IS NULL AND "content" IS NOT NULL AND char_length(btrim("content")) BETWEEN 1 AND 200)
      OR ("block_type" = 'text' AND "media_item_id" IS NULL AND "content" IS NOT NULL AND char_length(btrim("content")) BETWEEN 1 AND 5000)
    )
  )
  OR (
    "block_type"::text = 'entry_group' AND "media_item_id" IS NULL
    AND ("title" IS NULL OR char_length("title") <= 200)
    AND ("content" IS NULL OR char_length("content") <= 5000)
  )
);
--> statement-breakpoint
CREATE TABLE "editorial_document_block_items" (
  "block_id" integer NOT NULL REFERENCES "editorial_document_blocks"("id") ON DELETE CASCADE,
  "media_item_id" integer NOT NULL REFERENCES "media_items"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  CONSTRAINT "editorial_document_block_items_block_id_media_item_id_pk" PRIMARY KEY ("block_id", "media_item_id"),
  CONSTRAINT "editorial_document_block_items_position_unique" UNIQUE ("block_id", "position"),
  CONSTRAINT "editorial_document_block_items_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE INDEX "editorial_document_block_items_media_item_id_idx"
  ON "editorial_document_block_items" ("media_item_id");
