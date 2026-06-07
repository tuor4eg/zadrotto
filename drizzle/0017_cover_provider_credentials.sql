CREATE TABLE "cover_provider_credentials" (
  "provider_code" text PRIMARY KEY NOT NULL,
  "encrypted_payload" text NOT NULL,
  "key_hint" text NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cover_provider_credentials_updated_by_admin_id_admin_users_id_fk"
    FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id")
    ON DELETE set null ON UPDATE no action
);
