CREATE TABLE "cover_settings" (
  "id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
  "candidate_limit" integer DEFAULT 8 NOT NULL,
  "tmdb_result_scan_limit" integer DEFAULT 3 NOT NULL,
  "cover_max_bytes" integer DEFAULT 5242880 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cover_settings_singleton_id_check" CHECK ("cover_settings"."id" = 1),
  CONSTRAINT "cover_settings_candidate_limit_check" CHECK ("cover_settings"."candidate_limit" >= 1),
  CONSTRAINT "cover_settings_tmdb_scan_limit_check" CHECK ("cover_settings"."tmdb_result_scan_limit" >= 1),
  CONSTRAINT "cover_settings_cover_max_bytes_check" CHECK ("cover_settings"."cover_max_bytes" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cover_provider_settings" (
  "media_type" text NOT NULL,
  "provider_code" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cover_provider_settings_pk" PRIMARY KEY("media_type","provider_code"),
  CONSTRAINT "cover_provider_settings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "cover_provider_settings_priority_check" CHECK ("cover_provider_settings"."priority" >= 1)
);
--> statement-breakpoint
INSERT INTO "cover_settings" ("id", "candidate_limit", "tmdb_result_scan_limit", "cover_max_bytes")
VALUES (1, 8, 3, 5242880)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "cover_provider_settings" ("media_type", "provider_code", "enabled", "priority")
VALUES
  ('film', 'tmdb', true, 10),
  ('series', 'tmdb', true, 10),
  ('book', 'open-library', true, 10),
  ('book', 'google-books', true, 20),
  ('game', 'igdb', true, 10),
  ('game', 'rawg', true, 20),
  ('anime', 'jikan', true, 10)
ON CONFLICT ("media_type", "provider_code") DO NOTHING;
