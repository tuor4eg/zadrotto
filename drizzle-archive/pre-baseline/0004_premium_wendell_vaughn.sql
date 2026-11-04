ALTER TABLE "authors" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "authors" ("code", "name", "is_system", "created_at", "updated_at")
VALUES ('editorial', 'Редакция', true, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = excluded."name",
  "is_system" = true,
  "updated_at" = now();
