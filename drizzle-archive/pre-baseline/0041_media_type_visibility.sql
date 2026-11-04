ALTER TABLE "media_types" ADD COLUMN "is_publicly_available" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_types" ADD COLUMN "enabled_by_default" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "media_types"
SET
  "is_publicly_available" = true,
  "enabled_by_default" = true;
--> statement-breakpoint
CREATE TABLE "author_media_type_settings" (
  "author_id" integer NOT NULL,
  "media_type_id" integer NOT NULL,
  "is_enabled" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_media_type_settings_pk" PRIMARY KEY ("author_id", "media_type_id")
);
--> statement-breakpoint
ALTER TABLE "author_media_type_settings"
  ADD CONSTRAINT "author_media_type_settings_author_id_authors_id_fk"
  FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "author_media_type_settings"
  ADD CONSTRAINT "author_media_type_settings_media_type_id_media_types_id_fk"
  FOREIGN KEY ("media_type_id") REFERENCES "public"."media_types"("id")
  ON DELETE cascade ON UPDATE no action;
