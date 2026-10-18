-- Name normalization mirrors normalizeSearchText / normalizeSearchSql.
CREATE FUNCTION pg_temp.normalize_platform_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT btrim(replace(lower(regexp_replace(btrim(value), '\s+', ' ', 'g')), 'ё', 'е'))
$$;
--> statement-breakpoint
CREATE TEMP TABLE platform_backfill_sources ON COMMIT DROP AS
SELECT m.media_item_id, nullif(btrim(m.source_provider), '') AS provider, m.facts,
 CASE WHEN m.facts->'platforms' IS NULL OR m.facts->'platforms' = 'null'::jsonb THEN true
 WHEN jsonb_typeof(m.facts->'platforms') = 'string' THEN true
 WHEN jsonb_typeof(m.facts->'platforms') = 'array' THEN NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(m.facts->'platforms') value WHERE jsonb_typeof(value) <> 'string'
 ) ELSE false END AS valid_payload
FROM media_item_metadata m JOIN media_items i ON i.id = m.media_item_id WHERE i.media_type = 'game';
--> statement-breakpoint
CREATE TEMP TABLE platform_backfill_values ON COMMIT DROP AS
SELECT DISTINCT s.media_item_id, s.provider, btrim(value #>> '{}') AS name,
 pg_temp.normalize_platform_name(value #>> '{}') AS normalized_name
FROM platform_backfill_sources s
CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(s.facts->'platforms')
 WHEN 'array' THEN s.facts->'platforms' WHEN 'string' THEN jsonb_build_array(s.facts->'platforms') ELSE '[]'::jsonb END) value
WHERE s.valid_payload AND jsonb_typeof(value) = 'string' AND pg_temp.normalize_platform_name(value #>> '{}') <> '';
--> statement-breakpoint
INSERT INTO media_item_platforms(media_item_id, platform_id, provider)
SELECT DISTINCT b.media_item_id, p.id, b.provider
FROM platform_backfill_values b
JOIN provider_platform_mappings m ON m.provider = b.provider AND m.media_type = 'game'
 AND m.normalized_external_platform_name = b.normalized_name
JOIN platforms p ON p.id = m.platform_id AND p.is_active
WHERE NOT EXISTS (SELECT 1 FROM provider_platform_exclusions e WHERE e.provider = b.provider
 AND e.media_type = 'game' AND e.normalized_external_platform_name = b.normalized_name)
ON CONFLICT (media_item_id, platform_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_requests(provider, media_type, external_platform_name, normalized_external_platform_name)
SELECT b.provider, 'game', min(b.name), b.normalized_name FROM platform_backfill_values b
WHERE b.provider IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM provider_platform_mappings m WHERE m.provider = b.provider
  AND m.media_type = 'game' AND m.normalized_external_platform_name = b.normalized_name)
 AND NOT EXISTS (SELECT 1 FROM provider_platform_exclusions e WHERE e.provider = b.provider
  AND e.media_type = 'game' AND e.normalized_external_platform_name = b.normalized_name)
GROUP BY b.provider, b.normalized_name ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO platform_request_media_items(request_id, media_item_id, external_platform_name)
SELECT r.id, b.media_item_id, min(b.name) FROM platform_backfill_values b
JOIN platform_requests r ON r.provider = b.provider AND r.media_type = 'game'
 AND r.normalized_external_platform_name = b.normalized_name
GROUP BY r.id, b.media_item_id ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE diagnostic record; links_count integer; requests_count integer;
BEGIN
 FOR diagnostic IN SELECT provider, reason, count(*) AS count, (array_agg(media_item_id))[1:10] AS example_ids FROM (
  SELECT provider, media_item_id, 'invalid platforms' AS reason FROM platform_backfill_sources WHERE NOT valid_payload
  UNION ALL
  SELECT provider, media_item_id, 'unknown provider' AS reason FROM platform_backfill_sources
   WHERE provider IS NULL AND facts->'platforms' IS NOT NULL AND facts->'platforms' NOT IN ('null'::jsonb, '[]'::jsonb)
 ) diagnostics GROUP BY provider, reason LOOP
  RAISE WARNING 'Platform backfill: provider=%, reason=%, count=%, example_ids=%', diagnostic.provider, diagnostic.reason, diagnostic.count, diagnostic.example_ids;
 END LOOP;
 SELECT count(*) INTO links_count FROM media_item_platforms;
 SELECT count(*) INTO requests_count FROM platform_requests;
 RAISE NOTICE 'Platform backfill complete: % links, % requests', links_count, requests_count;
END $$;
--> statement-breakpoint
CREATE FUNCTION preserve_platform_request_job_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.type <> 'media.platform-request-apply' THEN RETURN OLD; END IF;
 UPDATE platform_requests SET
  apply_status = CASE WHEN OLD.status = 'succeeded' THEN CASE WHEN decision IS NULL THEN 'pending' ELSE 'processed' END ELSE 'failed' END,
  job_error = CASE WHEN OLD.status = 'succeeded' THEN NULL ELSE coalesce(left(OLD.error_message, 1000), job_error, 'Задача была отменена или удалена до завершения.') END,
  updated_at = now()
 WHERE job_run_id = OLD.id;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER preserve_platform_request_job_result_before_delete
 BEFORE DELETE ON job_runs FOR EACH ROW EXECUTE FUNCTION preserve_platform_request_job_result();
