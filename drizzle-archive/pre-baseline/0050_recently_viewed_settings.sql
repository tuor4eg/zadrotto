ALTER TABLE "archive_settings" ADD COLUMN "recently_viewed_history_limit" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD COLUMN "recently_viewed_ttl_days" integer DEFAULT 90 NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_recently_viewed_history_limit_check" CHECK ("archive_settings"."recently_viewed_history_limit" BETWEEN 1 AND 500);
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_recently_viewed_ttl_days_check" CHECK ("archive_settings"."recently_viewed_ttl_days" BETWEEN 1 AND 365);
