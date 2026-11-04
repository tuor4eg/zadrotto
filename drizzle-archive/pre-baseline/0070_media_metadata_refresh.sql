ALTER TABLE "media_items" ADD COLUMN "metadata_attempted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "media_items_metadata_attempted_at_idx" ON "media_items" USING btree ("metadata_attempted_at");
--> statement-breakpoint
INSERT INTO "jobs" (
  "code",
  "type",
  "payload",
  "cron_expression",
  "next_run_at",
  "enabled",
  "history_retention_days"
)
VALUES (
  'media-metadata-backfill',
  'media.metadata-backfill',
  '{"limit":25,"quotaReserve":100}'::jsonb,
  '0 4 * * *',
  now(),
  true,
  30
)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "jobs" (
  "code",
  "type",
  "payload",
  "cron_expression",
  "next_run_at",
  "enabled",
  "history_retention_days"
)
VALUES (
  'media-metadata-refresh',
  'media.metadata-refresh',
  '{"limit":20,"staleDays":90,"quotaReserve":100}'::jsonb,
  '0 5 * * 0',
  now(),
  true,
  30
)
ON CONFLICT ("code") DO NOTHING;
