LOCK TABLE ratings IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE title_parts (
 id serial PRIMARY KEY,
 media_item_id integer NOT NULL REFERENCES media_items(id),
 type text NOT NULL CHECK (type IN ('season','issue','volume','part')),
 number integer NOT NULL CHECK (number >= 0),
 name text, year integer, source_provider text, external_id text,
 air_date date, episode_count integer CHECK (episode_count >= 0),
 poster_source_url text, cover_url text, cover_thumb_url text,
 sort_order integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT title_parts_media_type_number_unique UNIQUE(media_item_id,type,number),
 CONSTRAINT title_parts_media_id_unique UNIQUE(media_item_id,id),
 CONSTRAINT title_parts_source_check CHECK (
   (source_provider IS NULL AND external_id IS NULL) OR
   (nullif(btrim(source_provider),'') IS NOT NULL AND nullif(btrim(external_id),'') IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX title_parts_provider_external_unique ON title_parts(media_item_id,source_provider,external_id)
 WHERE source_provider IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX title_parts_media_sort_idx ON title_parts(media_item_id,sort_order,id);
ALTER TABLE ratings ADD COLUMN part_id integer;
ALTER TABLE ratings ADD CONSTRAINT ratings_part_media_fk FOREIGN KEY(media_item_id,part_id) REFERENCES title_parts(media_item_id,id);
ALTER TABLE ratings DROP CONSTRAINT ratings_media_item_id_author_id_unique;
CREATE UNIQUE INDEX ratings_overall_unique ON ratings(media_item_id,author_id) WHERE part_id IS NULL;
CREATE UNIQUE INDEX ratings_part_unique ON ratings(media_item_id,author_id,part_id) WHERE part_id IS NOT NULL;
CREATE INDEX ratings_media_part_idx ON ratings(media_item_id,part_id);
ALTER TABLE contributions ADD COLUMN part_id integer;
ALTER TABLE contributions ADD CONSTRAINT contributions_part_media_fk FOREIGN KEY(primary_media_item_id,part_id) REFERENCES title_parts(media_item_id,id);
ALTER TABLE contributions ADD CONSTRAINT contributions_review_part_check CHECK(part_id IS NULL OR type = 'review');
DROP INDEX contributions_review_author_media_unique;
CREATE UNIQUE INDEX contributions_review_overall_unique ON contributions(author_id,primary_media_item_id) WHERE type = 'review' AND part_id IS NULL;
CREATE UNIQUE INDEX contributions_review_part_unique ON contributions(author_id,primary_media_item_id,part_id) WHERE type = 'review' AND part_id IS NOT NULL;
CREATE INDEX contributions_media_part_idx ON contributions(primary_media_item_id,part_id);
--> statement-breakpoint
DROP TRIGGER ratings_sync_media_item_rating_stats ON ratings;
ALTER TABLE media_item_rating_stats ALTER COLUMN score_sum TYPE numeric USING score_sum::numeric;
--> statement-breakpoint
CREATE FUNCTION lock_media_item_rating_stats() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.media_item_id <> NEW.media_item_id THEN
   PERFORM pg_advisory_xact_lock(73001, least(OLD.media_item_id, NEW.media_item_id));
   PERFORM pg_advisory_xact_lock(73001, greatest(OLD.media_item_id, NEW.media_item_id));
 ELSIF TG_OP = 'DELETE' THEN
   PERFORM pg_advisory_xact_lock(73001, OLD.media_item_id);
 ELSE
   PERFORM pg_advisory_xact_lock(73001, NEW.media_item_id);
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION refresh_media_item_rating_stats(item_id integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO media_item_rating_stats(media_item_id,ratings_count,score_sum)
 SELECT item_id, count(*)::integer, sum(effective_score)
 FROM (
   SELECT author_id,
     coalesce(max(score) FILTER (WHERE part_id IS NULL), avg(score) FILTER (WHERE part_id IS NOT NULL)) AS effective_score
   FROM ratings WHERE media_item_id = item_id GROUP BY author_id
 ) effective
 HAVING count(*) > 0
 ON CONFLICT(media_item_id) DO UPDATE SET ratings_count = EXCLUDED.ratings_count, score_sum = EXCLUDED.score_sum;
 DELETE FROM media_item_rating_stats WHERE media_item_id = item_id
   AND NOT EXISTS(SELECT 1 FROM ratings WHERE media_item_id = item_id);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_media_item_rating_stats() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   PERFORM refresh_media_item_rating_stats(OLD.media_item_id);
   RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' AND OLD.media_item_id <> NEW.media_item_id THEN
   PERFORM refresh_media_item_rating_stats(OLD.media_item_id);
 END IF;
 PERFORM refresh_media_item_rating_stats(NEW.media_item_id);
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ratings_lock_media_item_rating_stats
 BEFORE INSERT OR UPDATE OR DELETE ON ratings FOR EACH ROW EXECUTE FUNCTION lock_media_item_rating_stats();
CREATE TRIGGER ratings_sync_media_item_rating_stats
 AFTER INSERT OR UPDATE OR DELETE ON ratings FOR EACH ROW EXECUTE FUNCTION sync_media_item_rating_stats();
--> statement-breakpoint
DELETE FROM media_item_rating_stats;
INSERT INTO media_item_rating_stats(media_item_id,ratings_count,score_sum)
SELECT media_item_id, count(*)::integer AS ratings_count, sum(effective_score) AS score_sum
FROM (
  SELECT media_item_id, author_id,
    coalesce(max(score) FILTER (WHERE part_id IS NULL), avg(score) FILTER (WHERE part_id IS NOT NULL)) AS effective_score
  FROM ratings
  GROUP BY media_item_id, author_id
) effective
GROUP BY media_item_id;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
   WITH actual AS (
SELECT media_item_id, count(*)::integer AS ratings_count, sum(effective_score) AS score_sum
FROM (
  SELECT media_item_id, author_id,
    coalesce(max(score) FILTER (WHERE part_id IS NULL), avg(score) FILTER (WHERE part_id IS NOT NULL)) AS effective_score
  FROM ratings
  GROUP BY media_item_id, author_id
) effective
GROUP BY media_item_id
   ) SELECT 1 FROM actual FULL JOIN media_item_rating_stats projected USING(media_item_id)
   WHERE actual.ratings_count IS DISTINCT FROM projected.ratings_count
      OR actual.score_sum IS DISTINCT FROM projected.score_sum
 ) THEN RAISE EXCEPTION 'title parts rating statistics verification failed'; END IF;
END; $$;
