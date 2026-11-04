ALTER TABLE "achievements" ADD COLUMN "image_object_key" text;
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "show_when_locked" boolean DEFAULT true NOT NULL;
