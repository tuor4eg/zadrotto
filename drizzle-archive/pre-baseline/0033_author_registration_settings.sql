CREATE TABLE "author_registration_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_profile_id" integer,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_registration_settings_singleton_id_check" CHECK ("author_registration_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "author_registration_settings" ADD CONSTRAINT "author_registration_settings_access_profile_id_author_access_profiles_id_fk" FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_registration_settings" ADD CONSTRAINT "author_registration_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "author_registration_settings" ("id", "access_profile_id") VALUES (1, NULL);
