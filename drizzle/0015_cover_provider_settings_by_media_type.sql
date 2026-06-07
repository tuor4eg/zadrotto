DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'cover_provider_settings'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cover_provider_settings'
      AND column_name = 'media_type'
  ) THEN
    ALTER TABLE "cover_provider_settings"
      DROP CONSTRAINT IF EXISTS "cover_provider_settings_pkey";

    ALTER TABLE "cover_provider_settings"
      ADD COLUMN "media_type" text;

    UPDATE "cover_provider_settings"
    SET "media_type" = CASE
      WHEN "provider_code" IN ('open-library', 'google-books') THEN 'book'
      WHEN "provider_code" IN ('igdb', 'rawg') THEN 'game'
      WHEN "provider_code" = 'jikan' THEN 'anime'
      ELSE 'film'
    END;

    UPDATE "cover_provider_settings"
    SET "priority" = CASE
      WHEN "provider_code" IN ('tmdb', 'open-library', 'igdb', 'jikan') THEN 10
      WHEN "provider_code" IN ('google-books', 'rawg') THEN 20
      ELSE "priority"
    END;

    ALTER TABLE "cover_provider_settings"
      ALTER COLUMN "media_type" SET NOT NULL;

    INSERT INTO "cover_provider_settings" (
      "media_type",
      "provider_code",
      "enabled",
      "priority",
      "created_at",
      "updated_at"
    )
    SELECT
      'series',
      "provider_code",
      "enabled",
      "priority",
      "created_at",
      "updated_at"
    FROM "cover_provider_settings"
    WHERE "media_type" = 'film'
      AND "provider_code" = 'tmdb';

    ALTER TABLE "cover_provider_settings"
      ADD CONSTRAINT "cover_provider_settings_pk" PRIMARY KEY ("media_type", "provider_code");

    ALTER TABLE "cover_provider_settings"
      ADD CONSTRAINT "cover_provider_settings_media_type_media_types_code_fk"
      FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "cover_provider_settings" ("media_type", "provider_code", "enabled", "priority")
VALUES
  ('film', 'tmdb', true, 10),
  ('series', 'tmdb', true, 10),
  ('book', 'open-library', true, 10),
  ('book', 'google-books', true, 20),
  ('game', 'igdb', true, 10),
  ('game', 'rawg', true, 20),
  ('anime', 'jikan', true, 10)
ON CONFLICT ("media_type", "provider_code") DO NOTHING;
