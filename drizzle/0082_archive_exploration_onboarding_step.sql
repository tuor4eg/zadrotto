ALTER TABLE "author_archive_exploration_settings" ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'author_archive_exploration_settings'
			AND column_name = 'interests_selected_at'
	) THEN
		EXECUTE 'UPDATE "author_archive_exploration_settings"
			SET "onboarding_step" = 30
			WHERE "interests_selected_at" IS NOT NULL';
	END IF;
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'author_archive_exploration_settings'
			AND column_name = 'onboarding_completed_at'
	) THEN
		EXECUTE 'UPDATE "author_archive_exploration_settings"
			SET "onboarding_step" = 40
			WHERE "onboarding_completed_at" IS NOT NULL';
	END IF;
END $$;
--> statement-breakpoint
UPDATE "author_archive_exploration_settings" settings
SET "onboarding_step" = 100
WHERE (
	SELECT count(*) FROM (
		SELECT 1 FROM "ratings"
		WHERE "author_id" = settings."author_id"
		LIMIT 10
	) limited_ratings
) = 10;
--> statement-breakpoint
ALTER TABLE "author_archive_exploration_settings" ADD CONSTRAINT "author_archive_exploration_settings_onboarding_step_check" CHECK ("onboarding_step" BETWEEN 10 AND 100);
--> statement-breakpoint
ALTER TABLE "author_archive_exploration_settings" DROP COLUMN IF EXISTS "interests_selected_at";
--> statement-breakpoint
ALTER TABLE "author_archive_exploration_settings" DROP COLUMN IF EXISTS "onboarding_completed_at";
