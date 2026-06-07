ALTER TABLE "author_access_profiles"
  ADD COLUMN IF NOT EXISTS "cover_searches_per_minute" integer,
  ADD COLUMN IF NOT EXISTS "cover_searches_per_hour" integer,
  ADD COLUMN IF NOT EXISTS "cover_searches_per_day" integer;

UPDATE "author_access_profiles"
SET
  "cover_searches_per_minute" = coalesce("cover_searches_per_minute", 20),
  "cover_searches_per_hour" = coalesce("cover_searches_per_hour", 200),
  "cover_searches_per_day" = coalesce("cover_searches_per_day", 1000);

CREATE TABLE IF NOT EXISTS "cover_provider_rate_limits" (
  "provider_code" text PRIMARY KEY NOT NULL,
  "searches_per_day" integer DEFAULT 1000 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cover_provider_rate_limits_searches_per_day_check"
    CHECK ("cover_provider_rate_limits"."searches_per_day" >= 1)
);

INSERT INTO "cover_provider_rate_limits" ("provider_code", "searches_per_day")
VALUES
  ('tmdb', 1000),
  ('open-library', 1000),
  ('google-books', 1000),
  ('igdb', 1000),
  ('rawg', 1000),
  ('jikan', 1000)
ON CONFLICT ("provider_code") DO NOTHING;
