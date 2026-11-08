DROP INDEX "user_achievements_author_awarded_at_idx";--> statement-breakpoint
CREATE INDEX "user_achievements_author_awarded_at_idx" ON "user_achievements" USING btree ("author_id","awarded_at","id");