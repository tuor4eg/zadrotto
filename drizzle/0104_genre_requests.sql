CREATE TABLE "genre_requests" (
 "id" serial PRIMARY KEY,
 "provider" text NOT NULL,
 "media_type" text NOT NULL REFERENCES media_types(code),
 "external_genre_name" text NOT NULL,
 "normalized_external_genre_name" text NOT NULL,
 "first_seen_at" timestamptz DEFAULT now() NOT NULL,
 "last_seen_at" timestamptz DEFAULT now() NOT NULL,
 "decision" text,
 "resolved_by_admin_id" integer REFERENCES admin_users(id) ON DELETE SET NULL,
 "resolved_at" timestamptz,
 "job_run_id" integer REFERENCES job_runs(id) ON DELETE SET NULL,
 "apply_status" text DEFAULT 'pending' NOT NULL,
 "job_error" text,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "genre_requests_provider_check" CHECK (btrim(provider) <> ''),
 CONSTRAINT "genre_requests_name_check" CHECK (btrim(external_genre_name) <> '' AND btrim(normalized_external_genre_name) <> ''),
 CONSTRAINT "genre_requests_decision_check" CHECK (decision IS NULL OR decision IN ('create', 'map', 'exclude')),
 CONSTRAINT "genre_requests_apply_status_check" CHECK (apply_status IN ('pending', 'applying', 'processed', 'failed')),
 CONSTRAINT "genre_requests_resolution_check" CHECK (
  (decision IS NULL AND resolved_at IS NULL AND apply_status = 'pending') OR
  (decision IS NOT NULL AND resolved_at IS NOT NULL AND apply_status <> 'pending'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "genre_requests_key_unique_idx" ON genre_requests(provider, media_type, normalized_external_genre_name);
--> statement-breakpoint
CREATE INDEX "genre_requests_pending_idx" ON genre_requests(first_seen_at, id) WHERE decision IS NULL;
--> statement-breakpoint
CREATE INDEX "genre_requests_job_run_id_idx" ON genre_requests(job_run_id);
--> statement-breakpoint
CREATE TABLE "genre_request_media_items" (
 "request_id" integer NOT NULL REFERENCES genre_requests(id) ON DELETE CASCADE,
 "media_item_id" integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 "external_genre_name" text NOT NULL,
 "external_genre_id" text,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 PRIMARY KEY (request_id, media_item_id),
 CONSTRAINT "genre_request_media_items_name_check" CHECK (btrim(external_genre_name) <> ''),
 CONSTRAINT "genre_request_media_items_external_id_check" CHECK (external_genre_id IS NULL OR btrim(external_genre_id) <> '')
);
--> statement-breakpoint
CREATE INDEX "genre_request_media_items_item_idx" ON genre_request_media_items(media_item_id);
--> statement-breakpoint
CREATE TABLE "provider_genre_exclusions" (
 "id" serial PRIMARY KEY,
 "provider" text NOT NULL,
 "media_type" text NOT NULL REFERENCES media_types(code),
 "external_genre_name" text NOT NULL,
 "normalized_external_genre_name" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "provider_genre_exclusions_provider_check" CHECK (btrim(provider) <> ''),
 CONSTRAINT "provider_genre_exclusions_name_check" CHECK (btrim(external_genre_name) <> '' AND btrim(normalized_external_genre_name) <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_exclusions_key_unique_idx" ON provider_genre_exclusions(provider, media_type, normalized_external_genre_name);
--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_genre_request_apply_active_unique" ON job_runs((payload->>'requestId'))
 WHERE type = 'media.genre-request-apply' AND status IN ('queued', 'running');
--> statement-breakpoint
INSERT INTO provider_genre_exclusions(provider, media_type, external_genre_name, normalized_external_genre_name)
VALUES ('tmdb', 'film', 'телевизионный фильм', 'телевизионный фильм'), ('tmdb', 'film', 'TV Movie', 'tv movie')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- No historical separators are known: arrays of strings and whole string names only.
-- This normalization matches normalizeGenreNameSql / normalizeSearchText.
CREATE TEMP TABLE pending_genre_sources ON COMMIT DROP AS
SELECT m.media_item_id, i.media_type, nullif(btrim(m.source_provider), '') AS provider, m.facts,
 (
  (m.facts->'genres' IS NULL OR m.facts->'genres' = 'null'::jsonb OR jsonb_typeof(m.facts->'genres') = 'string'
   OR (jsonb_typeof(m.facts->'genres') = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.facts->'genres') = 'array' THEN m.facts->'genres' ELSE '[]'::jsonb END) g
    WHERE jsonb_typeof(g) <> 'string')))
  AND (NOT (m.facts ? 'genreReferences') OR (
   jsonb_typeof(m.facts->'genreReferences') = 'array'
   AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.facts->'genreReferences') = 'array' THEN m.facts->'genreReferences' ELSE '[]'::jsonb END) r
    WHERE jsonb_typeof(r) <> 'object' OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(r->'name') IS DISTINCT FROM 'string' OR regexp_replace(r->>'id', '^\s+|\s+$', '', 'g') = '' OR regexp_replace(r->>'name', '^\s+|\s+$', '', 'g') = ''
     OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE jsonb_typeof(m.facts->'genres')
       WHEN 'array' THEN m.facts->'genres' WHEN 'string' THEN jsonb_build_array(m.facts->'genres') ELSE '[]'::jsonb END) g
      WHERE jsonb_typeof(g) = 'string' AND
       btrim(replace(lower(regexp_replace(btrim(g #>> '{}'), '\s+', ' ', 'g')), 'ё', 'е')) =
       btrim(replace(lower(regexp_replace(btrim(r->>'name'), '\s+', ' ', 'g')), 'ё', 'е'))))
   AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.facts->'genreReferences') = 'array' THEN m.facts->'genreReferences' ELSE '[]'::jsonb END) r
    GROUP BY btrim(replace(lower(regexp_replace(btrim(r->>'name'), '\s+', ' ', 'g')), 'ё', 'е'))
    HAVING count(DISTINCT regexp_replace(r->>'id', '^\s+|\s+$', '', 'g')) > 1)
  ))
 ) AS valid_payload
FROM media_item_metadata m JOIN media_items i ON i.id = m.media_item_id;
--> statement-breakpoint
CREATE TEMP TABLE pending_genre_backfill ON COMMIT DROP AS
SELECT m.media_item_id, m.media_type, m.provider,
 value.raw, jsonb_typeof(value.raw) AS raw_type,
 CASE WHEN jsonb_typeof(value.raw) = 'string' THEN value.raw #>> '{}' END AS name,
 CASE WHEN jsonb_typeof(value.raw) = 'string' THEN
 btrim(replace(lower(regexp_replace(btrim(value.raw #>> '{}'), '\s+', ' ', 'g')), 'ё', 'е')) END AS normalized_name,
 CASE WHEN jsonb_typeof(value.raw) = 'string' THEN (
  SELECT regexp_replace(reference->>'id', '^\s+|\s+$', '', 'g') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.facts->'genreReferences') = 'array'
   THEN m.facts->'genreReferences' ELSE '[]'::jsonb END) reference
  WHERE jsonb_typeof(reference->'id') = 'string' AND regexp_replace(reference->>'id', '^\s+|\s+$', '', 'g') <> ''
   AND jsonb_typeof(reference->'name') = 'string'
   AND btrim(replace(lower(regexp_replace(btrim(reference->>'name'), '\s+', ' ', 'g')), 'ё', 'е')) =
    btrim(replace(lower(regexp_replace(btrim(value.raw #>> '{}'), '\s+', ' ', 'g')), 'ё', 'е'))
  ORDER BY reference->>'id' LIMIT 1
 ) END AS external_id
FROM pending_genre_sources m
CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(m.facts->'genres')
 WHEN 'array' THEN m.facts->'genres'
 WHEN 'string' THEN jsonb_build_array(m.facts->'genres')
 WHEN 'null' THEN '[]'::jsonb
 ELSE CASE WHEN m.facts ? 'genres' THEN jsonb_build_array(m.facts->'genres') ELSE '[]'::jsonb END
 END) value(raw)
WHERE m.valid_payload;
--> statement-breakpoint
INSERT INTO genre_requests(provider, media_type, external_genre_name, normalized_external_genre_name)
SELECT b.provider, b.media_type, min(btrim(b.name)), b.normalized_name
FROM pending_genre_backfill b
WHERE b.provider IS NOT NULL AND b.raw_type = 'string' AND b.normalized_name <> ''
 AND NOT EXISTS (SELECT 1 FROM provider_genre_exclusions e WHERE e.provider = b.provider
  AND e.media_type = b.media_type AND e.normalized_external_genre_name = b.normalized_name)
 AND NOT EXISTS (SELECT 1 FROM provider_genre_mappings p WHERE p.provider = b.provider AND p.media_type = b.media_type
  AND (p.normalized_external_genre_name = b.normalized_name OR p.external_genre_id = b.external_id))
GROUP BY b.provider, b.media_type, b.normalized_name
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO genre_request_media_items(request_id, media_item_id, external_genre_name, external_genre_id)
SELECT DISTINCT ON (r.id, b.media_item_id) r.id, b.media_item_id, btrim(b.name), b.external_id
FROM pending_genre_backfill b JOIN genre_requests r ON r.provider = b.provider
 AND r.media_type = b.media_type AND r.normalized_external_genre_name = b.normalized_name
ORDER BY r.id, b.media_item_id, b.name, b.external_id
ON CONFLICT (request_id, media_item_id) DO UPDATE
SET external_genre_name = excluded.external_genre_name, external_genre_id = excluded.external_genre_id
WHERE genre_request_media_items.external_genre_name IS DISTINCT FROM excluded.external_genre_name
 OR genre_request_media_items.external_genre_id IS DISTINCT FROM excluded.external_genre_id;
--> statement-breakpoint
DO $$
DECLARE diagnostic record; requests_count integer; occurrences_count integer;
BEGIN
 FOR diagnostic IN
  SELECT provider, media_type, reason, count(*) AS count, (array_agg(DISTINCT media_item_id))[1:10] AS example_ids
  FROM (
   SELECT media_item_id, provider, media_type, 'invalid genres or references' AS reason FROM pending_genre_sources WHERE valid_payload IS DISTINCT FROM true
   UNION ALL
   SELECT media_item_id, provider, media_type, 'unknown provider' FROM pending_genre_backfill WHERE provider IS NULL AND normalized_name <> ''
  ) diagnostics
  GROUP BY provider, media_type, reason
 LOOP
  RAISE WARNING 'Genre request backfill: invalid value or unknown provider, provider=%, type=%, reason=%, count=%, example_ids=%',
   diagnostic.provider, diagnostic.media_type, diagnostic.reason, diagnostic.count, diagnostic.example_ids;
 END LOOP;
 SELECT count(*) INTO requests_count FROM genre_requests;
 SELECT count(*) INTO occurrences_count FROM genre_request_media_items;
 RAISE NOTICE 'Genre request backfill complete: % requests, % current record occurrences', requests_count, occurrences_count;
END $$;
--> statement-breakpoint
-- Preserve the terminal result before ordinary job-history cleanup clears the FK.
CREATE FUNCTION preserve_genre_request_job_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.type <> 'media.genre-request-apply' THEN RETURN OLD; END IF;
 UPDATE genre_requests SET
  apply_status = CASE WHEN OLD.status = 'succeeded' THEN 'processed' ELSE 'failed' END,
  job_error = CASE WHEN OLD.status = 'succeeded' THEN NULL ELSE coalesce(left(OLD.error_message, 1000), job_error, 'Задача была отменена или удалена до завершения.') END,
  updated_at = now()
 WHERE job_run_id = OLD.id AND decision IS NOT NULL;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER preserve_genre_request_job_result_before_delete
 BEFORE DELETE ON job_runs FOR EACH ROW EXECUTE FUNCTION preserve_genre_request_job_result();
