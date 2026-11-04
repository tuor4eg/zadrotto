CREATE TABLE "personal_data_consents" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_id" integer NOT NULL REFERENCES "authors"("id") ON DELETE CASCADE,
  "version" text NOT NULL CHECK (btrim("version") <> ''),
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "personal_data_consents_revoked_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "accepted_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_consents_active_unique" ON "personal_data_consents" ("author_id", "version") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "personal_data_consents_author_idx" ON "personal_data_consents" ("author_id");
--> statement-breakpoint
CREATE TABLE "personal_data_consent_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "operator_details" text DEFAULT '' NOT NULL,
  "contact" text DEFAULT '' NOT NULL,
  CONSTRAINT "personal_data_consent_settings_singleton_check" CHECK ("id" = 1)
);
