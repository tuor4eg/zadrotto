ALTER TABLE "archive_settings"
  ADD COLUMN "daily_dossier_min_ratings_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings"
  ADD CONSTRAINT "archive_settings_daily_dossier_min_ratings_count_check"
  CHECK ("archive_settings"."daily_dossier_min_ratings_count" BETWEEN 0 AND 1000);
