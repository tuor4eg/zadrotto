LOCK TABLE ratings IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_media_item_rating_stats(item_id integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO media_item_rating_stats(media_item_id,ratings_count,score_sum)
 SELECT item_id, count(*)::integer, sum(effective_score)
 FROM (
   SELECT author_id,
     coalesce(max(score) FILTER (WHERE part_id IS NULL), avg(score) FILTER (WHERE part_id IS NOT NULL)) AS effective_score
   FROM ratings WHERE media_item_id = item_id AND NOT EXISTS (SELECT 1 FROM title_parts p WHERE p.id = ratings.part_id AND p.type = 'season' AND p.number = 0) GROUP BY author_id
 ) effective
 HAVING count(*) > 0
 ON CONFLICT(media_item_id) DO UPDATE SET ratings_count = EXCLUDED.ratings_count, score_sum = EXCLUDED.score_sum;
 DELETE FROM media_item_rating_stats WHERE media_item_id = item_id
   AND NOT EXISTS(SELECT 1 FROM ratings WHERE media_item_id = item_id AND NOT EXISTS (SELECT 1 FROM title_parts p WHERE p.id = ratings.part_id AND p.type = 'season' AND p.number = 0));
END;
$$;

--> statement-breakpoint
CREATE FUNCTION reject_specials_rating() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM title_parts WHERE id = NEW.part_id AND type = 'season' AND number = 0) THEN
   RAISE EXCEPTION 'Specials cannot be rated' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ratings_reject_specials BEFORE INSERT OR UPDATE ON ratings
FOR EACH ROW EXECUTE FUNCTION reject_specials_rating();
--> statement-breakpoint
SELECT refresh_media_item_rating_stats(id) FROM media_items ORDER BY id;
