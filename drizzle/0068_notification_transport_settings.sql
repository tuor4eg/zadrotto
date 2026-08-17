CREATE TABLE "notification_transport_settings" (
	"code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_payload" text,
	"key_hint" text,
	"chat_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_transport_settings_code_check" CHECK ("code" in ('telegram')),
	CONSTRAINT "notification_transport_settings_code_trim_check" CHECK (btrim("code") <> '')
);
--> statement-breakpoint
ALTER TABLE "notification_transport_settings" ADD CONSTRAINT "notification_transport_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
