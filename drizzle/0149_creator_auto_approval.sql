CREATE INDEX provider_creator_mappings_name_search_idx ON provider_creator_mappings USING gin ((replace(lower(regexp_replace(btrim(coalesce(external_creator_name, '')), '\s+', ' ', 'g')), 'ё', 'е')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX provider_creator_bindings_name_search_idx ON provider_creator_bindings USING gin ((replace(lower(regexp_replace(btrim(coalesce(external_creator_name, '')), '\s+', ' ', 'g')), 'ё', 'е')) gin_trgm_ops) WHERE active;
--> statement-breakpoint
CREATE INDEX creator_requests_auto_approval_idx ON creator_requests(id) WHERE decision IS NULL AND manually_reopened = false AND apply_status = 'pending';
--> statement-breakpoint
INSERT INTO job_runs(type,payload,source,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
SELECT 'media.creator-request-auto-approve', jsonb_build_object('afterId',0,'upToId',max(r.id)), 'event',now(),now(),3,300,60,3600
FROM creator_requests r
WHERE r.decision IS NULL AND r.manually_reopened = false AND r.apply_status = 'pending'
  AND EXISTS (SELECT 1 FROM creator_request_media_items o WHERE o.request_id = r.id)
HAVING max(r.id) IS NOT NULL;
