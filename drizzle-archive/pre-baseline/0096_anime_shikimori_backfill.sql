ALTER TABLE "media_items" ADD COLUMN "shikimori_enrichment_attempted_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_anime_shikimori_backfill_active_unique"
ON "job_runs" USING btree ("type")
WHERE "type" = 'media.anime-shikimori-backfill' and "status" in ('queued', 'running');
--> statement-breakpoint
INSERT INTO "jobs" (
  "code",
  "type",
  "payload",
  "cron_expression",
  "next_run_at",
  "enabled",
  "history_retention_days",
  "max_attempts",
  "timeout_seconds"
)
VALUES (
  'anime-shikimori-backfill',
  'media.anime-shikimori-backfill',
  '{}'::jsonb,
  '* * * * *',
  now(),
  true,
  30,
  1,
  60
)
ON CONFLICT ("code") DO NOTHING;
