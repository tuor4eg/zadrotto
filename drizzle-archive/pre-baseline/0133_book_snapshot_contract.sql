-- Deploy together with workers using the permanent book snapshot contract.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Freeze the former gate and its book population until validation and DROP commit.
LOCK TABLE provider_settings, media_items, media_item_metadata IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM media_item_metadata m
    JOIN media_items i ON i.id=m.media_item_id AND i.media_type='book'
    LEFT JOIN provider_settings p ON p.media_type='book' AND p.provider_code=m.source_provider
    WHERE m.source_provider IN ('fantlab','google-books','open-library')
      AND NOT coalesce(p.normalized_book_metadata,false)
  ) THEN
    RAISE EXCEPTION 'BOOK_PROVIDER_CUTOVER_REQUIRED: migrate and verify existing books before removing the temporary gate';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE provider_settings DROP COLUMN normalized_book_metadata;
