CREATE TABLE "author_access_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"can_publish_media_without_review" boolean DEFAULT false NOT NULL,
	"max_draft_media_items" integer,
	"max_upload_bytes" integer,
	"max_files_per_media_item" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_access_profiles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
INSERT INTO "author_access_profiles" (
	"code",
	"name",
	"is_system",
	"can_publish_media_without_review",
	"max_draft_media_items",
	"max_upload_bytes",
	"max_files_per_media_item"
)
VALUES
	('system', 'Системный', true, true, NULL, NULL, NULL),
	('regular', 'Обычный автор', false, false, NULL, NULL, NULL),
	('trusted', 'Доверенный автор', false, true, NULL, NULL, NULL);
--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "access_profile_id" integer;
--> statement-breakpoint
UPDATE "authors"
SET "access_profile_id" = CASE
	WHEN "authors"."is_system" THEN (
		SELECT "id" FROM "author_access_profiles" WHERE "code" = 'system'
	)
	ELSE (
		SELECT "id" FROM "author_access_profiles" WHERE "code" = 'regular'
	)
END;
--> statement-breakpoint
ALTER TABLE "authors" ALTER COLUMN "access_profile_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_access_profile_id_author_access_profiles_id_fk" FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authors_access_profile_id_idx" ON "authors" USING btree ("access_profile_id");--> statement-breakpoint
DROP TABLE "author_permissions";--> statement-breakpoint
DROP TYPE "public"."author_permission";
