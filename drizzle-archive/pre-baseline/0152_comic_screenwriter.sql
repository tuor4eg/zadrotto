-- Deploy the updated application and workers before this migration; old workers
-- still write writer and must be stopped until the new version is running.
INSERT INTO creator_roles (name, code) VALUES ('Сценарист', 'screenwriter') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
-- Pseudonym assignments have writer-only semantics elsewhere in the application.
-- Refuse to silently change or hide them; handle such data explicitly first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM entry_creator_pseudonyms p JOIN media_items m ON m.id=p.entry_id JOIN creator_roles r ON r.id=p.role_id WHERE m.media_type='comic' AND r.code='writer') THEN
    RAISE EXCEPTION 'COMIC_WRITER_PSEUDONYM_REQUIRES_REVIEW';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO entry_creators (entry_id, creator_id, role_id, is_manual, created_at, updated_at)
SELECT ec.entry_id, ec.creator_id, target.id, ec.is_manual, ec.created_at, ec.updated_at
FROM entry_creators ec JOIN media_items m ON m.id=ec.entry_id
JOIN creator_roles old ON old.id=ec.role_id AND old.code='writer'
CROSS JOIN creator_roles target WHERE target.code='screenwriter' AND m.media_type='comic'
ON CONFLICT (entry_id, creator_id, role_id) DO UPDATE SET is_manual=entry_creators.is_manual OR excluded.is_manual;
--> statement-breakpoint
INSERT INTO entry_creator_sources (entry_id, creator_id, role_id, provider, normalized_external_creator_name, binding_id, source_position)
SELECT s.entry_id, s.creator_id, target.id, s.provider, s.normalized_external_creator_name, s.binding_id, s.source_position
FROM entry_creator_sources s JOIN media_items m ON m.id=s.entry_id
JOIN creator_roles old ON old.id=s.role_id AND old.code='writer'
CROSS JOIN creator_roles target WHERE target.code='screenwriter' AND m.media_type='comic'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM entry_creators ec USING media_items m, creator_roles old
WHERE ec.entry_id=m.id AND ec.role_id=old.id AND old.code='writer' AND m.media_type='comic';
--> statement-breakpoint
INSERT INTO creator_request_media_items (request_id, media_item_id, role_id, external_creator_name, source_position, created_at, updated_at)
SELECT o.request_id, o.media_item_id, target.id, o.external_creator_name, o.source_position, o.created_at, o.updated_at
FROM creator_request_media_items o JOIN media_items m ON m.id=o.media_item_id
JOIN creator_roles old ON old.id=o.role_id AND old.code='writer'
CROSS JOIN creator_roles target WHERE target.code='screenwriter' AND m.media_type='comic'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM creator_request_media_items o USING media_items m, creator_roles old
WHERE o.media_item_id=m.id AND o.role_id=old.id AND old.code='writer' AND m.media_type='comic';
--> statement-breakpoint
UPDATE media_item_metadata metadata SET facts=jsonb_set(metadata.facts, '{comicVinePersonCreators}', converted.roster)
FROM media_items m, (
  SELECT mm.media_item_id, jsonb_agg(CASE WHEN value->>'roleCode'='writer' THEN jsonb_set(value, '{roleCode}', '"screenwriter"'::jsonb) ELSE value END ORDER BY position) AS roster
  FROM media_item_metadata mm CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(mm.facts->'comicVinePersonCreators')='array' THEN mm.facts->'comicVinePersonCreators' ELSE '[]'::jsonb END) WITH ORDINALITY AS element(value, position)
  JOIN media_items mi ON mi.id=mm.media_item_id AND mi.media_type='comic'
  WHERE jsonb_typeof(mm.facts->'comicVinePersonCreators')='array'
  GROUP BY mm.media_item_id
) converted
WHERE m.id=metadata.media_item_id AND m.media_type='comic' AND converted.media_item_id=metadata.media_item_id
  AND metadata.facts->'comicVinePersonCreators' @> '[{"roleCode":"writer"}]'::jsonb;
