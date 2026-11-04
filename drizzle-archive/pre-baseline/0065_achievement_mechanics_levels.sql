ALTER TABLE "achievements" ADD COLUMN "mechanic" text;
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "params" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "achievements" SET "mechanic" = 'rating.authored.count', "params" = '{}'::jsonb
WHERE "code" IN ('first-rating', 'ratings-10');
--> statement-breakpoint
UPDATE "achievements" SET "mechanic" = 'rating.authored.count', "params" = '{"mediaType":"game"}'::jsonb
WHERE "code" = 'games-rated-10';
--> statement-breakpoint
UPDATE "achievements" SET "mechanic" = 'rating.authored.count', "params" = '{"mediaType":"film"}'::jsonb
WHERE "code" = 'films-rated-10';
--> statement-breakpoint
UPDATE "achievements" SET "mechanic" = 'review.authored.count', "params" = '{}'::jsonb
WHERE "code" = 'first-published-review';
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "achievements" WHERE "mechanic" IS NULL) THEN
		RAISE EXCEPTION 'Achievement has no mechanic mapping; migrate it explicitly before continuing';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "achievements" ALTER COLUMN "mechanic" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_mechanic_check" CHECK (btrim("mechanic") <> '');
--> statement-breakpoint
CREATE TABLE "achievement_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"achievement_id" integer NOT NULL,
	"level" integer NOT NULL,
	"threshold" integer NOT NULL,
	"name" text,
	"description" text,
	"image_object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_levels_achievement_level_unique" UNIQUE("achievement_id","level"),
	CONSTRAINT "achievement_levels_achievement_threshold_unique" UNIQUE("achievement_id","threshold"),
	CONSTRAINT "achievement_levels_level_check" CHECK ("level" > 0),
	CONSTRAINT "achievement_levels_threshold_check" CHECK ("threshold" > 0),
	CONSTRAINT "achievement_levels_name_check" CHECK ("name" is null or btrim("name") <> ''),
	CONSTRAINT "achievement_levels_description_check" CHECK ("description" is null or btrim("description") <> '')
);
--> statement-breakpoint
ALTER TABLE "achievement_levels" ADD CONSTRAINT "achievement_levels_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "achievement_levels_achievement_id_idx" ON "achievement_levels" USING btree ("achievement_id");
--> statement-breakpoint
INSERT INTO "achievement_levels" ("achievement_id", "level", "threshold")
SELECT "id", 1, CASE "code"
	WHEN 'first-rating' THEN 1
	WHEN 'ratings-10' THEN 10
	WHEN 'games-rated-10' THEN 10
	WHEN 'films-rated-10' THEN 10
	WHEN 'first-published-review' THEN 1
END
FROM "achievements"
WHERE "code" IN ('first-rating', 'ratings-10', 'games-rated-10', 'films-rated-10', 'first-published-review');
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD COLUMN "achievement_level_id" integer;
--> statement-breakpoint
UPDATE "user_achievements" ua
SET "achievement_level_id" = al."id"
FROM "achievement_levels" al
WHERE al."achievement_id" = ua."achievement_id" AND al."level" = 1;
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "user_achievements" WHERE "achievement_level_id" IS NULL) THEN
		RAISE EXCEPTION 'Legacy user achievement has no unambiguous achievement level';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_achievements" ALTER COLUMN "achievement_level_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_level_id_achievement_levels_id_fk" FOREIGN KEY ("achievement_level_id") REFERENCES "public"."achievement_levels"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_author_achievement_unique";
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_author_achievement_level_unique" UNIQUE("author_id","achievement_level_id");
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_achievement_id_achievements_id_fk";
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP COLUMN "achievement_id";
--> statement-breakpoint
INSERT INTO "achievements" ("code", "name", "description", "mechanic", "params", "display_order")
VALUES ('series-rated-10', '10 сериалов', 'Оценить 10 опубликованных сериалов.', 'rating.authored.count', '{"mediaType":"series"}'::jsonb, 45)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "achievement_levels" ("achievement_id", "level", "threshold")
SELECT "id", 1, 10 FROM "achievements" WHERE "code" = 'series-rated-10'
ON CONFLICT ("achievement_id", "level") DO NOTHING;
--> statement-breakpoint
INSERT INTO "job_runs" (
	"type", "payload", "source", "scheduled_for", "available_at",
	"max_attempts", "timeout_seconds", "retry_base_seconds", "retry_max_seconds"
)
SELECT 'achievements.backfill', jsonb_build_object('achievementIds', jsonb_build_array("id")),
	'event', now(), now(), 3, 300, 60, 3600
FROM "achievements" WHERE "code" = 'series-rated-10';
