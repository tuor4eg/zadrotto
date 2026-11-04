CREATE TABLE "provider_image_settings" (
	"provider_code" text PRIMARY KEY NOT NULL,
	"proxy_images_enabled" boolean DEFAULT false NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_image_settings_code_check" CHECK (btrim("provider_image_settings"."provider_code") <> '')
);
--> statement-breakpoint
ALTER TABLE "provider_image_settings" ADD CONSTRAINT "provider_image_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
