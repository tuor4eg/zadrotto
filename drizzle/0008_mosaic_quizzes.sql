ALTER TABLE "quiz_participants" ADD COLUMN "mechanic_state" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD COLUMN "awarded_points" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "type" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "config_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_revision_check" CHECK ("quiz_participants"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_awarded_points_check" CHECK ("quiz_participants"."awarded_points" is null or "quiz_participants"."awarded_points" between 0 and 10);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_type_check" CHECK ("quizzes"."type" in ('classic', 'mosaic'));--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_config_check" CHECK ("quizzes"."config_version" = 1 and (("quizzes"."type" = 'classic' and "quizzes"."config" is null) or ("quizzes"."type" = 'mosaic' and "quizzes"."config" is not null and "quizzes"."config" ? 'seed' and jsonb_typeof("quizzes"."config"->'seed') = 'number' and ("quizzes"."config"->>'seed')::numeric between 0 and 4294967295 and ("quizzes"."config"->>'seed')::numeric = trunc(("quizzes"."config"->>'seed')::numeric) and "quizzes"."image_object_key" is not null and "quizzes"."attempt_limit" = 10)));--> statement-breakpoint
UPDATE "quiz_participants" SET "awarded_points" = CASE WHEN "outcome" = 'correct' THEN "attempts_remaining" ELSE 0 END WHERE "outcome" IS NOT NULL;
