ALTER TABLE "achievement_levels"
  ADD COLUMN "rarity" text DEFAULT 'common' NOT NULL,
  ADD COLUMN "showcase_background_image_object_key" text;
--> statement-breakpoint
ALTER TABLE "achievement_levels"
  ADD CONSTRAINT "achievement_levels_rarity_check"
  CHECK ("rarity" IN ('common', 'rare', 'epic', 'legendary'));
