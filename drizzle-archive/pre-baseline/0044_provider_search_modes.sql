ALTER TABLE "provider_settings"
  ADD COLUMN "title_search_mode" text DEFAULT 'parallel' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings"
  ADD COLUMN "cover_search_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_settings"
  ADD CONSTRAINT "provider_settings_title_search_mode_check"
  CHECK ("title_search_mode" IN ('parallel', 'fallback', 'off'));--> statement-breakpoint
UPDATE "provider_settings"
SET
  "title_search_mode" = 'off',
  "cover_search_enabled" = true
WHERE "media_type" = 'anime' AND "provider_code" = 'tmdb';
