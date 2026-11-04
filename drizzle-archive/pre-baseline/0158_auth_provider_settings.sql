ALTER TABLE "provider_credentials" ADD COLUMN "purpose" text DEFAULT 'content' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_purpose_check" CHECK ("purpose" IN ('content', 'auth'));
--> statement-breakpoint
ALTER TABLE "provider_credentials" DROP CONSTRAINT "provider_credentials_pk";
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_pk" PRIMARY KEY ("purpose", "provider_code");
--> statement-breakpoint
CREATE TABLE "auth_provider_settings" (
  "provider_code" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "revision" uuid DEFAULT gen_random_uuid() NOT NULL,
  "updated_by_admin_id" integer REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
