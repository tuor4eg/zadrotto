ALTER TABLE "authors" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "blocked_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_blocked_by_admin_id_admin_users_id_fk" FOREIGN KEY ("blocked_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;