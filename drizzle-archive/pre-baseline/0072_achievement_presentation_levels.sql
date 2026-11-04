ALTER TABLE "achievements" DROP CONSTRAINT "achievements_description_check";
--> statement-breakpoint
ALTER TABLE "achievements" ALTER COLUMN "description" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_description_check" CHECK ("achievements"."description" is null or btrim("achievements"."description") <> '');
--> statement-breakpoint
ALTER TABLE "achievements" DROP COLUMN "image_object_key";
