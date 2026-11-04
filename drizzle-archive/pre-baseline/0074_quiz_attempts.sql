ALTER TABLE "quizzes" ADD COLUMN "attempt_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_attempt_limit_check" CHECK ("attempt_limit" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD COLUMN "attempts_remaining" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_participants" ALTER COLUMN "attempts_remaining" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_attempts_remaining_check" CHECK ("attempts_remaining" >= 0);--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('correct', 'exhausted'));--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_completion_check" CHECK (("outcome" IS NULL AND "completed_at" IS NULL) OR ("outcome" IS NOT NULL AND "completed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_attempt_state_check" CHECK (("outcome" IS NULL AND "attempts_remaining" > 0) OR "outcome" = 'correct' OR ("outcome" = 'exhausted' AND "attempts_remaining" = 0));
