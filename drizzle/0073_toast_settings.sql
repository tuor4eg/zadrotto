CREATE TABLE "toast_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"site_duration_seconds" integer DEFAULT 5 NOT NULL,
	"admin_duration_seconds" integer DEFAULT 5 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toast_settings_singleton_id_check" CHECK ("toast_settings"."id" = 1),
	CONSTRAINT "toast_settings_site_duration_check" CHECK ("toast_settings"."site_duration_seconds" between 1 and 60),
	CONSTRAINT "toast_settings_admin_duration_check" CHECK ("toast_settings"."admin_duration_seconds" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "toast_settings" ADD CONSTRAINT "toast_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "toast_settings" ("id") VALUES (1);
