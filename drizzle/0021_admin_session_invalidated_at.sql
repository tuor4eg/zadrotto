ALTER TABLE "admin_users" ADD COLUMN "session_invalidated_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "admin_users"
SET "session_invalidated_at" = "updated_at"
WHERE "session_invalidated_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "session_invalidated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "session_invalidated_at" SET NOT NULL;
