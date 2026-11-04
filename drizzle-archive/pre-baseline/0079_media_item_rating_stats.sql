LOCK TABLE "ratings" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "media_item_rating_stats" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"ratings_count" integer NOT NULL,
	"score_sum" integer NOT NULL,
	CONSTRAINT "media_item_rating_stats_count_check" CHECK ("ratings_count" >= 1),
	CONSTRAINT "media_item_rating_stats_sum_check" CHECK ("score_sum" BETWEEN "ratings_count" * 10 AND "ratings_count" * 100)
);
--> statement-breakpoint
ALTER TABLE "media_item_rating_stats" ADD CONSTRAINT "media_item_rating_stats_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "media_item_rating_stats" ("media_item_id", "ratings_count", "score_sum")
SELECT "media_item_id", count(*)::integer, sum("score")::integer
FROM "ratings"
GROUP BY "media_item_id";
--> statement-breakpoint
CREATE FUNCTION "sync_media_item_rating_stats"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.media_item_id <> NEW.media_item_id THEN
    PERFORM pg_advisory_xact_lock(73001, LEAST(OLD.media_item_id, NEW.media_item_id));
    PERFORM pg_advisory_xact_lock(73001, GREATEST(OLD.media_item_id, NEW.media_item_id));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pg_advisory_xact_lock(73001, OLD.media_item_id);
  ELSE
    PERFORM pg_advisory_xact_lock(73001, NEW.media_item_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO "media_item_rating_stats" ("media_item_id", "ratings_count", "score_sum")
    VALUES (NEW.media_item_id, 1, NEW.score)
    ON CONFLICT ("media_item_id") DO UPDATE SET
      "ratings_count" = "media_item_rating_stats"."ratings_count" + 1,
      "score_sum" = "media_item_rating_stats"."score_sum" + EXCLUDED."score_sum";
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM "media_item_rating_stats"
    WHERE "media_item_id" = OLD.media_item_id AND "ratings_count" = 1;
    IF NOT FOUND THEN
      UPDATE "media_item_rating_stats" SET
        "ratings_count" = "ratings_count" - 1,
        "score_sum" = "score_sum" - OLD.score
      WHERE "media_item_id" = OLD.media_item_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.media_item_id = NEW.media_item_id THEN
    UPDATE "media_item_rating_stats" SET "score_sum" = "score_sum" + NEW.score - OLD.score
    WHERE "media_item_id" = NEW.media_item_id;
    RETURN NEW;
  END IF;

  DELETE FROM "media_item_rating_stats"
  WHERE "media_item_id" = OLD.media_item_id AND "ratings_count" = 1;
  IF NOT FOUND THEN
    UPDATE "media_item_rating_stats" SET
      "ratings_count" = "ratings_count" - 1,
      "score_sum" = "score_sum" - OLD.score
    WHERE "media_item_id" = OLD.media_item_id;
  END IF;
  INSERT INTO "media_item_rating_stats" ("media_item_id", "ratings_count", "score_sum")
  VALUES (NEW.media_item_id, 1, NEW.score)
  ON CONFLICT ("media_item_id") DO UPDATE SET
    "ratings_count" = "media_item_rating_stats"."ratings_count" + 1,
    "score_sum" = "media_item_rating_stats"."score_sum" + EXCLUDED."score_sum";
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ratings_sync_media_item_rating_stats"
AFTER INSERT OR UPDATE OF "media_item_id", "score" OR DELETE ON "ratings"
FOR EACH ROW EXECUTE FUNCTION "sync_media_item_rating_stats"();
--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_ratings_count_idx" ON "media_item_rating_stats" USING btree ("ratings_count");
--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_average_score_idx" ON "media_item_rating_stats" USING btree ((("score_sum")::double precision / "ratings_count"));
--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_quality_media_item_idx" ON "media_item_rating_stats" USING btree ("media_item_id") WHERE "score_sum" >= "ratings_count" * 70;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT r.media_item_id, count(*)::integer AS ratings_count, sum(r.score)::integer AS score_sum
      FROM ratings r GROUP BY r.media_item_id
    ) actual
    FULL JOIN media_item_rating_stats stats USING (media_item_id)
    WHERE actual.ratings_count IS DISTINCT FROM stats.ratings_count
       OR actual.score_sum IS DISTINCT FROM stats.score_sum
  ) THEN
    RAISE EXCEPTION 'media_item_rating_stats backfill verification failed';
  END IF;
END;
$$;
--> statement-breakpoint
INSERT INTO "jobs" (
  "code", "type", "payload", "cron_expression", "next_run_at", "enabled", "history_retention_days"
)
VALUES (
  'media-item-rating-stats-reconciliation',
  'media.rating-stats-reconcile',
  '{"batchSize":500}'::jsonb,
  '0 1 * * *',
  now(),
  true,
  30
)
ON CONFLICT ("code") DO NOTHING;
