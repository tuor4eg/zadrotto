-- Serialize cleanup and constraint replacement against concurrent status writes.
LOCK TABLE "author_media_statuses" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DELETE FROM "author_media_statuses" WHERE "status" = 'skipped';--> statement-breakpoint
ALTER TABLE "author_media_statuses" DROP CONSTRAINT "author_media_statuses_status_check";--> statement-breakpoint
ALTER TABLE "author_media_statuses" ADD CONSTRAINT "author_media_statuses_status_check" CHECK ("author_media_statuses"."status" in ('wanted'));
