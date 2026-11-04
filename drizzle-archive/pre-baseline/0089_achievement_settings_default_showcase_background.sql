ALTER TABLE "achievement_settings"
  ADD COLUMN "default_showcase_background_image_object_key" text;
--> statement-breakpoint
ALTER TABLE "achievement_settings"
  ADD CONSTRAINT "achievement_settings_default_showcase_background_image_object_key_check"
  CHECK (
    "default_showcase_background_image_object_key" is null
    or btrim("default_showcase_background_image_object_key") <> ''
  );
