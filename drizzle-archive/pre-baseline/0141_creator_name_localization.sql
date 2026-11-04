ALTER TABLE creators ADD COLUMN name_ru text, ADD COLUMN name_ru_source text, ADD COLUMN name_ru_processed boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE creators ADD CONSTRAINT creators_name_ru_check CHECK ((name_ru IS NULL OR (btrim(name_ru) <> '' AND char_length(name_ru) <= 200)) AND (name_ru_source IS NULL OR name_ru_source IN ('ai','manual','provider')) AND (name_ru IS NULL OR name_ru_source IS NOT NULL));
--> statement-breakpoint
UPDATE creators SET name_ru_processed = true WHERE char_length(regexp_replace(regexp_replace(name, '[^[:alpha:]]', '', 'g'), '[^Ѐ-ӿ]', '', 'g')) * 2 > char_length(regexp_replace(name, '[^[:alpha:]]', '', 'g'));
--> statement-breakpoint
CREATE INDEX creators_name_ru_search_idx ON creators USING gin ((replace(lower(regexp_replace(btrim(coalesce(name_ru, '')), '\s+', ' ', 'g')), 'ё', 'е')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX creators_name_ru_pending_idx ON creators(type_id,id) WHERE name_ru_processed = false AND (name_ru_source IS NULL OR name_ru_source = 'ai');
--> statement-breakpoint
CREATE UNIQUE INDEX job_runs_creator_name_localization_active_unique ON job_runs(type) WHERE type = 'media.creator-name-localization' AND status IN ('queued','running');
--> statement-breakpoint
INSERT INTO jobs(code,type,payload,cron_expression,next_run_at,enabled,max_attempts)
VALUES ('creator-name-localization','media.creator-name-localization','{"batchSize":20,"requestsPerMinute":5,"requestsPerDay":200}', '* * * * *', now(), false, 5)
ON CONFLICT(code) DO NOTHING;
