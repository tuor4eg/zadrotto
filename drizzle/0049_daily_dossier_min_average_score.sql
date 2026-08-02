ALTER TABLE "archive_settings" ADD COLUMN "daily_dossier_min_average_score" integer DEFAULT 6 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_daily_dossier_min_average_score_check" CHECK ("archive_settings"."daily_dossier_min_average_score" BETWEEN 0 AND 10);
