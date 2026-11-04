CREATE TABLE "ai_provider_settings" (
  "provider_code" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "default_model_id" text,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_provider_settings_code_check" CHECK (btrim("provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
  "provider_code" text PRIMARY KEY NOT NULL,
  "encrypted_payload" text NOT NULL,
  "key_hint" text NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_provider_credentials_code_check" CHECK (btrim("provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "ai_scenario_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "provider_code" text NOT NULL,
  "model_id" text NOT NULL,
  "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_scenario_profiles_key_check" CHECK (btrim("key") <> ''),
  CONSTRAINT "ai_scenario_profiles_provider_code_check" CHECK (btrim("provider_code") <> ''),
  CONSTRAINT "ai_scenario_profiles_model_id_check" CHECK (btrim("model_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "ai_call_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "scenario_profile_id" integer,
  "profile_key" text NOT NULL,
  "provider_code" text,
  "model_id" text,
  "status" text NOT NULL,
  "latency_ms" integer NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "provider_request_id" text,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_call_logs_status_check" CHECK ("status" in ('success', 'failure')),
  CONSTRAINT "ai_call_logs_latency_check" CHECK ("latency_ms" >= 0),
  CONSTRAINT "ai_call_logs_input_tokens_check" CHECK ("input_tokens" is null or "input_tokens" >= 0),
  CONSTRAINT "ai_call_logs_output_tokens_check" CHECK ("output_tokens" is null or "output_tokens" >= 0),
  CONSTRAINT "ai_call_logs_error_code_check" CHECK ("error_code" is null or "error_code" in ('configuration', 'authentication', 'rate-limit', 'timeout', 'provider-unavailable', 'invalid-response'))
);
--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_scenario_profiles" ADD CONSTRAINT "ai_scenario_profiles_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_scenario_profile_id_ai_scenario_profiles_id_fk" FOREIGN KEY ("scenario_profile_id") REFERENCES "public"."ai_scenario_profiles"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_scenario_profiles_key_unique" ON "ai_scenario_profiles" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "ai_call_logs_created_at_idx" ON "ai_call_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ai_call_logs_profile_created_at_idx" ON "ai_call_logs" USING btree ("profile_key","created_at");
--> statement-breakpoint
CREATE INDEX "ai_call_logs_status_created_at_idx" ON "ai_call_logs" USING btree ("status","created_at");
