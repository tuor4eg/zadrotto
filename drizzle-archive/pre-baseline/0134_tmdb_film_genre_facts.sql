-- Run with the film projection update. Keep raw evidence stable through validation
-- and cleanup; this migration never fetches or modifies snapshots or links.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
LOCK TABLE media_items, media_item_metadata IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
LOCK TABLE provider_snapshot_links, provider_snapshots IN SHARE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM media_item_metadata m
    JOIN media_items i ON i.id=m.media_item_id AND i.media_type='film'
    WHERE m.source_provider='tmdb' AND m.facts ?| ARRAY['genres','genreReferences']
      AND NOT EXISTS (
        SELECT 1 FROM provider_snapshot_links l
        JOIN provider_snapshots s ON s.id=l.snapshot_id
        WHERE l.entity_type='media-item' AND l.entity_id=m.media_item_id::text AND l.purpose='primary'
          AND s.provider_code='tmdb' AND s.resource_type='movie'
          AND s.external_id=m.source_external_id AND s.api_method='movie.details'
          -- snapshotHash({append_to_response:'credits',language:'ru-RU'}).
          AND s.request_key='7e588b52755d9ea4ef1a6a905b02f8a5c16ce04253c56ceef2c9d98a91e4a447'
          AND s.request_params='{"append_to_response":"credits","language":"ru-RU"}'::jsonb
          AND jsonb_typeof(s.payload)='object'
          AND jsonb_typeof(s.payload->'id')='number' AND s.payload->>'id'=m.source_external_id
          AND m.source_external_id ~ '^[1-9][0-9]*$'
          AND jsonb_typeof(s.payload->'genres')='array'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.payload->'genres')='array' THEN s.payload->'genres' ELSE '[]'::jsonb END) genre
            WHERE jsonb_typeof(genre)<>'object' OR jsonb_typeof(genre->'name') IS DISTINCT FROM 'string'
          )
      )
  ) THEN
    RAISE EXCEPTION 'TMDB_FILM_GENRE_SNAPSHOT_REQUIRED: link a valid current primary movie snapshot before removing genre facts';
  END IF;
END $$;
--> statement-breakpoint
UPDATE media_item_metadata m SET facts=m.facts-'genres'-'genreReferences'
FROM media_items i WHERE i.id=m.media_item_id AND i.media_type='film'
  AND m.source_provider='tmdb' AND m.facts ?| ARRAY['genres','genreReferences'];
