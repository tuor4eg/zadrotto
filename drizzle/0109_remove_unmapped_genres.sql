CREATE INDEX "provider_genre_mappings_genre_id_idx" ON "provider_genre_mappings" USING btree ("genre_id");
--> statement-breakpoint
-- Remove existing genres with no provider mappings, including their normalized
-- record links. Raw provider facts and series memberships remain untouched.
DO $$
DECLARE
  orphan_ids integer[];
BEGIN
  SELECT array_agg(candidate.id) INTO orphan_ids FROM (
    SELECT genre.id FROM genres genre
    WHERE NOT EXISTS (SELECT 1 FROM provider_genre_mappings mapping WHERE mapping.genre_id = genre.id)
    ORDER BY genre.id FOR UPDATE
  ) candidate;

  -- A concurrent mapping may have committed while row locks were acquired.
  SELECT array_agg(genre.id) INTO orphan_ids FROM genres genre
  WHERE genre.id = ANY(orphan_ids)
    AND NOT EXISTS (SELECT 1 FROM provider_genre_mappings mapping WHERE mapping.genre_id = genre.id);

  DELETE FROM media_item_genres WHERE genre_id = ANY(orphan_ids);
  DELETE FROM genres WHERE id = ANY(orphan_ids);
END $$;
