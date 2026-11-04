-- Requeue historical descriptions; the enrichment worker fetches and sanitizes them.
UPDATE "media_items" AS item
SET "shikimori_enrichment_attempted_at" = NULL
WHERE item."media_type" = 'anime'
  AND item."shikimori_enrichment_attempted_at" IS NOT NULL
  AND item."description" ~ '\[(?:(?:character|person|anime|manga)=[0-9]+|/(?:character|person|anime|manga))\]'
  AND EXISTS (
    SELECT 1
    FROM "media_item_metadata" AS metadata
    WHERE metadata."media_item_id" = item."id"
      AND metadata."source_provider" = 'anilist'
      AND metadata."source_external_id" ~ '^[1-9][0-9]*$'
  );
