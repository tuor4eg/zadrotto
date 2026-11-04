ALTER TABLE "media_types" ADD COLUMN "is_available_to_guests" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "media_types" SET "is_available_to_guests" = true;
--> statement-breakpoint
CREATE TABLE "author_access_profile_media_types" (
  "access_profile_id" integer NOT NULL,
  "media_type_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_access_profile_media_types_pk" PRIMARY KEY ("access_profile_id", "media_type_id")
);
--> statement-breakpoint
ALTER TABLE "author_access_profile_media_types"
  ADD CONSTRAINT "author_access_profile_media_types_access_profile_id_author_access_profiles_id_fk"
  FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "author_access_profile_media_types"
  ADD CONSTRAINT "author_access_profile_media_types_media_type_id_media_types_id_fk"
  FOREIGN KEY ("media_type_id") REFERENCES "public"."media_types"("id")
  ON DELETE cascade ON UPDATE no action;
