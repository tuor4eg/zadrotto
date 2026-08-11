ALTER TABLE "media_items" ADD COLUMN "author_creation_request_id" text;
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "cover_thumb_attempted_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_author_creation_request_id_unique_idx" ON "media_items" USING btree ("created_by_author_id", "author_creation_request_id");
--> statement-breakpoint
CREATE INDEX "media_items_cover_thumb_attempted_at_idx" ON "media_items" USING btree ("cover_thumb_attempted_at");
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
  'cover-thumbnails-backfill',
  'media.cover-thumbnails-backfill',
  '{"limit":50}'::jsonb,
  '30 3 * * *',
  now(),
  true,
  30
)
ON CONFLICT ("code") DO NOTHING;
