DROP INDEX "quiz_participants_one_winner_idx";--> statement-breakpoint
ALTER TABLE "quiz_participants" DROP CONSTRAINT "quiz_participants_winner_check";--> statement-breakpoint
ALTER TABLE "quiz_participants" DROP COLUMN "is_winner";
