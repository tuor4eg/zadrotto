CREATE TABLE "achievement_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"locked_image_object_key" text,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_settings_singleton_id_check" CHECK ("achievement_settings"."id" = 1),
	CONSTRAINT "achievement_settings_locked_image_object_key_check" CHECK ("achievement_settings"."locked_image_object_key" is null or btrim("achievement_settings"."locked_image_object_key") <> '')
);
--> statement-breakpoint
ALTER TABLE "achievement_settings" ADD CONSTRAINT "achievement_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "achievement_settings" ("id", "locked_image_object_key") VALUES (1, NULL);
