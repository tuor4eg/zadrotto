ALTER TABLE "quizzes" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 2000);
