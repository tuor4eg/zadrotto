ALTER TABLE "cover_settings"
  ADD COLUMN "provider_request_timeout_ms" integer DEFAULT 15000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "cover_settings"
  ADD CONSTRAINT "cover_settings_provider_request_timeout_ms_check"
  CHECK ("cover_settings"."provider_request_timeout_ms" BETWEEN 1000 AND 120000);
