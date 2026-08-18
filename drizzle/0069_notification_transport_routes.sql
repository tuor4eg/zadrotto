CREATE TABLE "notification_transport_routes" (
	"code" text PRIMARY KEY NOT NULL,
	"transport_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_transport_routes_code_check" CHECK ("code" in ('submission_created')),
	CONSTRAINT "notification_transport_routes_code_trim_check" CHECK (btrim("code") <> '')
);
--> statement-breakpoint
ALTER TABLE "notification_transport_routes" ADD CONSTRAINT "notification_transport_routes_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
