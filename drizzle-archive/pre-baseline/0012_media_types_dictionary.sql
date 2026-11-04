CREATE TABLE "media_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_types_code_unique" UNIQUE("code")
);--> statement-breakpoint
INSERT INTO "media_types" ("code", "name")
VALUES
  ('game', 'Игра'),
  ('film', 'Фильм'),
  ('series', 'Сериал'),
  ('book', 'Книга'),
  ('comic', 'Комикс'),
  ('anime', 'Аниме'),
  ('other', 'Другое')
ON CONFLICT ("code") DO UPDATE SET
  "name" = excluded."name",
  "updated_at" = now();--> statement-breakpoint
ALTER TABLE "media_carriers" ALTER COLUMN "media_type" TYPE text USING "media_type"::text;--> statement-breakpoint
ALTER TABLE "media_items" ALTER COLUMN "media_type" TYPE text USING "media_type"::text;--> statement-breakpoint
ALTER TABLE "media_carriers" ADD CONSTRAINT "media_carriers_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."media_type";
