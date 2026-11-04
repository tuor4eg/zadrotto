CREATE TABLE "media_carrier_media_types" (
	"media_carrier_id" integer NOT NULL,
	"media_type" text NOT NULL,
	CONSTRAINT "media_carrier_media_types_pk" PRIMARY KEY("media_carrier_id","media_type")
);
--> statement-breakpoint
ALTER TABLE "media_carrier_media_types" ADD CONSTRAINT "media_carrier_media_types_media_carrier_id_media_carriers_id_fk" FOREIGN KEY ("media_carrier_id") REFERENCES "public"."media_carriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_carrier_media_types" ADD CONSTRAINT "media_carrier_media_types_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_carrier_media_types_media_type_idx" ON "media_carrier_media_types" USING btree ("media_type");--> statement-breakpoint
INSERT INTO "media_carrier_media_types" ("media_carrier_id", "media_type")
SELECT "id", "media_type"
FROM "media_carriers"
ON CONFLICT ("media_carrier_id", "media_type") DO NOTHING;
--> statement-breakpoint
INSERT INTO "media_carriers" ("code", "name", "media_type", "description")
VALUES
  ('dvd', 'DVD', 'film', NULL),
  ('streaming', 'Streaming', 'film', NULL)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = excluded."name",
  "updated_at" = now();
--> statement-breakpoint
WITH canonical_carrier_types(carrier_code, media_type) AS (
VALUES
  ('dvd', 'film'),
  ('dvd', 'series'),
  ('dvd', 'anime'),
  ('streaming', 'film'),
  ('streaming', 'series'),
  ('streaming', 'anime')
)
INSERT INTO "media_carrier_media_types" ("media_carrier_id", "media_type")
SELECT "media_carriers"."id", canonical_carrier_types."media_type"
FROM canonical_carrier_types
INNER JOIN "media_carriers" ON "media_carriers"."code" = canonical_carrier_types."carrier_code"
ON CONFLICT ("media_carrier_id", "media_type") DO NOTHING;
--> statement-breakpoint
WITH carrier_replacements(old_code, new_code) AS (
VALUES
  ('dvd-anime', 'dvd'),
  ('dvd-film', 'dvd'),
  ('dvd-series', 'dvd'),
  ('streaming-film', 'streaming'),
  ('streaming-series', 'streaming')
)
UPDATE "media_items"
SET
  "media_carrier_id" = new_carriers."id",
  "updated_at" = now()
FROM carrier_replacements
INNER JOIN "media_carriers" old_carriers ON old_carriers."code" = carrier_replacements."old_code"
INNER JOIN "media_carriers" new_carriers ON new_carriers."code" = carrier_replacements."new_code"
WHERE "media_items"."media_carrier_id" = old_carriers."id"
  AND "media_items"."media_carrier_id" IS DISTINCT FROM new_carriers."id";
--> statement-breakpoint
WITH starter_media_carriers(media_code, carrier_code) AS (
VALUES
  ('the-matrix', 'dvd'),
  ('twin-peaks-season-1', 'dvd'),
  ('dune-part-one', 'streaming'),
  ('neon-genesis-evangelion', 'dvd'),
  ('the-matrix-reloaded', 'dvd'),
  ('twin-peaks-the-return', 'streaming')
)
UPDATE "media_items"
SET
  "media_carrier_id" = "media_carriers"."id",
  "updated_at" = now()
FROM starter_media_carriers
INNER JOIN "media_carriers" ON "media_carriers"."code" = starter_media_carriers."carrier_code"
INNER JOIN "media_carrier_media_types"
  ON "media_carrier_media_types"."media_carrier_id" = "media_carriers"."id"
WHERE "media_items"."code" = starter_media_carriers."media_code"
  AND "media_carrier_media_types"."media_type" = "media_items"."media_type"
  AND "media_items"."media_carrier_id" IS DISTINCT FROM "media_carriers"."id";
--> statement-breakpoint
DELETE FROM "media_carriers"
WHERE "code" IN (
  'dvd-anime',
  'dvd-film',
  'dvd-series',
  'streaming-film',
  'streaming-series'
)
AND NOT EXISTS (
  SELECT 1
  FROM "media_items"
  WHERE "media_items"."media_carrier_id" = "media_carriers"."id"
);
--> statement-breakpoint
DROP INDEX IF EXISTS "media_carriers_media_type_idx";--> statement-breakpoint
ALTER TABLE "media_carriers" DROP CONSTRAINT IF EXISTS "media_carriers_media_type_media_types_code_fk";--> statement-breakpoint
ALTER TABLE "media_carriers" DROP COLUMN "media_type";
