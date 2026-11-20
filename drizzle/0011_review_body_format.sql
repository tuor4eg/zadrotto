ALTER TABLE "contribution_reviews" ADD COLUMN "body_format" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "body_text_length" integer;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_body_format_check" CHECK ("contribution_reviews"."body_format" in ('plain', 'markdown'));--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_body_text_length_check" CHECK ("contribution_reviews"."body_text_length" is null or "contribution_reviews"."body_text_length" >= 0);
--> statement-breakpoint
INSERT INTO job_runs (type, payload, source, scheduled_for, available_at, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds)
VALUES ('reviews.body-length-backfill', '{}'::jsonb, 'event', now(), now(), 3, 120, 60, 3600);
