DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'media_types'
      AND column_name = 'plural_name'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "media_types" (
        "code", "name", "plural_name", "description",
        "is_publicly_available", "is_available_to_guests", "enabled_by_default"
      )
      VALUES ('roblox', 'Roblox', 'Roblox', 'Experiences Roblox', true, true, true)
      ON CONFLICT ("code") DO UPDATE SET
        "name" = excluded."name",
        "plural_name" = excluded."plural_name",
        "description" = excluded."description",
        "is_publicly_available" = excluded."is_publicly_available",
        "is_available_to_guests" = excluded."is_available_to_guests",
        "enabled_by_default" = excluded."enabled_by_default",
        "updated_at" = now()
    $sql$;
  ELSE
    INSERT INTO "media_types" (
      "code", "name", "description",
      "is_publicly_available", "is_available_to_guests", "enabled_by_default"
    )
    VALUES ('roblox', 'Roblox', 'Experiences Roblox', true, true, true)
    ON CONFLICT ("code") DO UPDATE SET
      "name" = excluded."name",
      "description" = excluded."description",
      "is_publicly_available" = excluded."is_publicly_available",
      "is_available_to_guests" = excluded."is_available_to_guests",
      "enabled_by_default" = excluded."enabled_by_default",
      "updated_at" = now();
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "provider_settings" (
  "media_type",
  "provider_code",
  "enabled",
  "title_search_mode",
  "cover_search_enabled",
  "priority"
)
VALUES ('roblox', 'roblox', true, 'parallel', true, 10)
ON CONFLICT ("media_type", "provider_code") DO UPDATE SET
  "enabled" = excluded."enabled",
  "title_search_mode" = excluded."title_search_mode",
  "cover_search_enabled" = excluded."cover_search_enabled",
  "priority" = excluded."priority",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "provider_rate_limits" ("provider_code", "searches_per_day")
VALUES ('roblox', 500)
ON CONFLICT ("provider_code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "provider_image_settings" ("provider_code", "proxy_images_enabled")
VALUES ('roblox', true)
ON CONFLICT ("provider_code") DO NOTHING;
