DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM authors WHERE code = 'pasha') THEN
    RAISE EXCEPTION 'Author pasha not found';
  END IF;
END $$;
--> statement-breakpoint
UPDATE media_items
SET
  description = NULL,
  updated_at = now()
FROM authors
INNER JOIN author_media_experiences
  ON author_media_experiences.author_id = authors.id
WHERE authors.code = 'pasha'
  AND media_items.id = author_media_experiences.media_item_id
  AND media_items.media_type = 'game'
  AND media_items.description IN (
    'Проходил в ' || to_char(author_media_experiences.first_experienced_at, 'YYYY'),
    'Проходил в ' || to_char(author_media_experiences.first_experienced_at, 'YYYY') || ', в коопе'
  );
