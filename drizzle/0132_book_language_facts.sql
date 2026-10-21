-- Run together with the application update: old workers still refer to the column.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Prevent an old writer from changing facts after validation and before DROP.
LOCK TABLE media_item_metadata IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
-- Fail before cleanup if an enabled book provider has an unreviewed characteristic.
-- The normal cutover audit already verifies contributor migration and manual decisions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM media_item_metadata m
    JOIN media_items i ON i.id=m.media_item_id AND i.media_type='book'
    JOIN provider_settings p ON p.media_type='book' AND p.provider_code=m.source_provider AND p.normalized_book_metadata
    CROSS JOIN LATERAL jsonb_each(m.facts) f
    WHERE f.key NOT IN ('authors','publishers','fantlabAuthors','originalLanguage')
      AND f.value NOT IN ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
      AND NOT (jsonb_typeof(f.value)='string' AND btrim(f.value #>> '{}')='')
  ) THEN
    RAISE EXCEPTION 'UNMIGRATED_BOOK_FACTS: review normalized book characteristics before compacting facts';
  END IF;
  IF EXISTS (
    SELECT 1 FROM media_item_metadata m
    JOIN media_items i ON i.id=m.media_item_id AND i.media_type='book'
    JOIN provider_settings p ON p.media_type='book' AND p.provider_code=m.source_provider AND p.normalized_book_metadata
    WHERE m.facts ? 'originalLanguage' AND jsonb_typeof(m.facts->'originalLanguage') NOT IN ('string','null')
  ) THEN
    RAISE EXCEPTION 'INVALID_LANGUAGE_FACT: normalized book language must be a string';
  END IF;
  IF EXISTS (
    SELECT 1 FROM media_item_metadata m
    WHERE nullif(btrim(m.original_language),'') IS NOT NULL
      AND (jsonb_typeof(m.facts)<>'object'
        OR (m.facts ? 'originalLanguage' AND jsonb_typeof(m.facts->'originalLanguage') NOT IN ('string','null')))
  ) THEN
    RAISE EXCEPTION 'INVALID_LANGUAGE_FACT: review metadata before moving original_language';
  END IF;
END $$;
--> statement-breakpoint
-- Enabled books read the column today, so it has priority there. All other
-- records retain their current facts value, using the column only as a fallback.
WITH prepared AS (
  SELECT m.media_item_id,m.facts,m.original_language,
    i.media_type='book' AND coalesce(p.normalized_book_metadata,false) AS normalized,
    CASE WHEN i.media_type='book' AND coalesce(p.normalized_book_metadata,false)
      THEN coalesce(nullif(btrim(m.original_language),''),nullif(btrim(m.facts->>'originalLanguage'),''))
      ELSE coalesce(nullif(btrim(m.facts->>'originalLanguage'),''),nullif(btrim(m.original_language),'')) END AS language
  FROM media_item_metadata m
  JOIN media_items i ON i.id=m.media_item_id
  LEFT JOIN provider_settings p ON p.media_type='book' AND p.provider_code=m.source_provider
), projected AS (
  SELECT p.media_item_id,
    CASE WHEN p.normalized THEN
      CASE WHEN p.language IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('originalLanguage',p.language) END
    WHEN nullif(btrim(p.original_language),'') IS NOT NULL
      AND (p.facts->'originalLanguage' IS NULL OR p.facts->'originalLanguage'='null'::jsonb
        OR (jsonb_typeof(p.facts->'originalLanguage')='string' AND btrim(p.facts->>'originalLanguage')=''))
      THEN p.facts || jsonb_build_object('originalLanguage',p.language)
    ELSE p.facts END AS facts
  FROM prepared p
)
UPDATE media_item_metadata m SET facts=p.facts
FROM projected p WHERE p.media_item_id=m.media_item_id AND m.facts IS DISTINCT FROM p.facts;
--> statement-breakpoint
ALTER TABLE media_item_metadata DROP COLUMN original_language;
