CREATE TABLE "collection_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "max_blocks" integer DEFAULT 300 NOT NULL,
  "max_entries" integer DEFAULT 200 NOT NULL,
  "updated_by_admin_id" integer REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "collection_settings_singleton_id_check" CHECK ("id" = 1),
  CONSTRAINT "collection_settings_max_blocks_check" CHECK ("max_blocks" > 0),
  CONSTRAINT "collection_settings_max_entries_check" CHECK ("max_entries" > 0)
);
--> statement-breakpoint
INSERT INTO "collection_settings" ("id") VALUES (1);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_editorial_document_block_limits() RETURNS trigger AS $$
DECLARE
  target_document_id integer;
  block_count bigint;
  entry_count bigint;
  max_blocks integer;
  max_entries integer;
BEGIN
  IF TG_TABLE_NAME = 'editorial_document_block_items' THEN
    SELECT document_id INTO target_document_id FROM editorial_document_blocks WHERE id = NEW.block_id;
  ELSE
    target_document_id := NEW.document_id;
  END IF;
  IF target_document_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(6431, target_document_id);
  SELECT s.max_blocks, s.max_entries INTO max_blocks, max_entries FROM collection_settings s WHERE id = 1;
  SELECT count(*), count(*) FILTER (WHERE block_type = 'media')
    INTO block_count, entry_count FROM editorial_document_blocks WHERE document_id = target_document_id;
  SELECT entry_count + count(*) INTO entry_count
    FROM editorial_document_block_items i JOIN editorial_document_blocks b ON b.id = i.block_id
    WHERE b.document_id = target_document_id AND b.block_type::text = 'entry_group';
  IF block_count > coalesce(max_blocks, 300) THEN
    RAISE EXCEPTION 'blocks-limit:%', coalesce(max_blocks, 300);
  END IF;
  IF entry_count > coalesce(max_entries, 200) THEN
    RAISE EXCEPTION 'media-blocks-limit:%', coalesce(max_entries, 200);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "editorial_document_block_items_limits_trigger"
AFTER INSERT OR UPDATE OF block_id ON "editorial_document_block_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_editorial_document_block_limits();
