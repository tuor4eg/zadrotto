ALTER TABLE "archive_settings" ADD COLUMN "top_archive_min_average_score" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD COLUMN "top_archive_min_ratings_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_top_archive_min_average_score_check" CHECK ("archive_settings"."top_archive_min_average_score" BETWEEN 0 AND 10);
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_top_archive_min_ratings_count_check" CHECK ("archive_settings"."top_archive_min_ratings_count" BETWEEN 0 AND 1000);
