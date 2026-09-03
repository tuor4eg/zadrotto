CREATE TYPE "editorial_document_kind" AS ENUM ('collection', 'article');
--> statement-breakpoint
CREATE TYPE "editorial_document_block_type" AS ENUM ('media', 'heading', 'text');
--> statement-breakpoint
CREATE TABLE "editorial_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "editorial_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_document_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"position" integer NOT NULL,
	"block_type" "editorial_document_block_type" NOT NULL,
	"media_item_id" integer,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_document_blocks_position_unique" UNIQUE("document_id", "position"),
	CONSTRAINT "editorial_document_blocks_position_check" CHECK ("position" >= 0),
	CONSTRAINT "editorial_document_blocks_shape_check" CHECK (
		("block_type" = 'media' AND "media_item_id" IS NOT NULL AND ("content" IS NULL OR char_length("content") <= 1000))
		OR ("block_type" = 'heading' AND "media_item_id" IS NULL AND "content" IS NOT NULL AND char_length(btrim("content")) BETWEEN 1 AND 200)
		OR ("block_type" = 'text' AND "media_item_id" IS NULL AND "content" IS NOT NULL AND char_length(btrim("content")) BETWEEN 1 AND 5000)
	)
);
--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD COLUMN "document_id" integer;
--> statement-breakpoint
DO $$
DECLARE
	collection_row record;
	new_document_id integer;
BEGIN
	FOR collection_row IN SELECT id, created_at, updated_at FROM editorial_collections LOOP
		INSERT INTO editorial_documents (kind, created_at, updated_at)
		VALUES ('collection', collection_row.created_at, collection_row.updated_at)
		RETURNING id INTO new_document_id;

		UPDATE editorial_collections SET document_id = new_document_id WHERE id = collection_row.id;
		INSERT INTO editorial_document_blocks (
			document_id, position, block_type, media_item_id, content, created_at, updated_at
		)
		SELECT new_document_id, position, 'media', media_item_id, editorial_comment, created_at, updated_at
		FROM editorial_collection_items
		WHERE collection_id = collection_row.id
		ORDER BY position;
	END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "editorial_collections" ALTER COLUMN "document_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_document_id_unique" UNIQUE("document_id");
--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_document_id_editorial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."editorial_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editorial_document_blocks" ADD CONSTRAINT "editorial_document_blocks_document_id_editorial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."editorial_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editorial_document_blocks" ADD CONSTRAINT "editorial_document_blocks_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "editorial_document_blocks_document_position_idx" ON "editorial_document_blocks" USING btree ("document_id", "position");
--> statement-breakpoint
CREATE INDEX "editorial_document_blocks_media_item_id_idx" ON "editorial_document_blocks" USING btree ("media_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_document_blocks_document_media_unique" ON "editorial_document_blocks" USING btree ("document_id", "media_item_id") WHERE "block_type" = 'media';
--> statement-breakpoint
CREATE FUNCTION enforce_editorial_document_block_limits() RETURNS trigger AS $$
DECLARE
	block_count integer;
	media_count integer;
BEGIN
	PERFORM pg_advisory_xact_lock(6431, NEW.document_id);
	SELECT count(*)::integer, count(*) FILTER (WHERE block_type = 'media')::integer
	INTO block_count, media_count
	FROM editorial_document_blocks
	WHERE document_id = NEW.document_id;
	IF block_count > 300 THEN
		RAISE EXCEPTION 'editorial document cannot contain more than 300 blocks';
	END IF;
	IF media_count > 200 THEN
		RAISE EXCEPTION 'editorial document cannot contain more than 200 media blocks';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "editorial_document_blocks_limits_trigger"
AFTER INSERT OR UPDATE OF document_id, block_type ON "editorial_document_blocks"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_editorial_document_block_limits();
--> statement-breakpoint
DROP TABLE "editorial_collection_items";
