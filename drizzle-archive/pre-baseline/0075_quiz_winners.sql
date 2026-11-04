ALTER TABLE "quiz_participants" ADD COLUMN "is_winner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "quiz_participants" AS "participant"
SET "is_winner" = true
FROM (
  SELECT DISTINCT ON ("quiz_id") "quiz_id", "author_id"
  FROM "quiz_participants"
  WHERE "outcome" = 'correct'
  ORDER BY "quiz_id", "completed_at" ASC, "author_id" ASC
) AS "winner"
WHERE "participant"."quiz_id" = "winner"."quiz_id"
  AND "participant"."author_id" = "winner"."author_id";--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_winner_check" CHECK ("is_winner" = false OR "outcome" = 'correct');--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_participants_one_winner_idx" ON "quiz_participants" USING btree ("quiz_id") WHERE "is_winner" = true;
