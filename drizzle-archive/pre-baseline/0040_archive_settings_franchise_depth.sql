DO $$
DECLARE
  current_max_depth integer;
  visited_count integer;
BEGIN
  WITH RECURSIVE franchise_depths AS (
    SELECT id, parent_id, 1 AS depth, ARRAY[id] AS path
    FROM "franchises"
    WHERE parent_id IS NULL
    UNION ALL
    SELECT child.id, child.parent_id, franchise_depths.depth + 1, franchise_depths.path || child.id
    FROM "franchises" child
    INNER JOIN franchise_depths ON child.parent_id = franchise_depths.id
    WHERE NOT child.id = ANY(franchise_depths.path)
  )
  SELECT COALESCE(MAX(depth), 1), COUNT(*) INTO current_max_depth, visited_count
  FROM franchise_depths;

  IF visited_count <> (SELECT COUNT(*) FROM "franchises") THEN
    RAISE EXCEPTION 'Cannot add franchise depth limit: existing hierarchy contains a cycle';
  END IF;
  IF current_max_depth > 5 THEN
    RAISE EXCEPTION 'Cannot add franchise depth limit: existing hierarchy depth % exceeds supported maximum 5', current_max_depth;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD COLUMN "max_franchise_depth" integer;
--> statement-breakpoint
WITH RECURSIVE franchise_depths AS (
  SELECT id, parent_id, 1 AS depth, ARRAY[id] AS path
  FROM "franchises"
  WHERE parent_id IS NULL
  UNION ALL
  SELECT child.id, child.parent_id, franchise_depths.depth + 1, franchise_depths.path || child.id
  FROM "franchises" child
  INNER JOIN franchise_depths ON child.parent_id = franchise_depths.id
  WHERE NOT child.id = ANY(franchise_depths.path)
)
UPDATE "archive_settings"
SET "max_franchise_depth" = GREATEST(3, COALESCE((SELECT MAX(depth) FROM franchise_depths), 1));
--> statement-breakpoint
ALTER TABLE "archive_settings" ALTER COLUMN "max_franchise_depth" SET DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "archive_settings" ALTER COLUMN "max_franchise_depth" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_max_franchise_depth_check" CHECK ("max_franchise_depth" BETWEEN 2 AND 5);
