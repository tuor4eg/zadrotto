CREATE TABLE provider_part_snapshot_links (
  media_item_id integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  snapshot_id integer NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  part_id integer REFERENCES title_parts(id) ON DELETE SET NULL,
  PRIMARY KEY (media_item_id, snapshot_id),
  CONSTRAINT provider_part_snapshot_links_part_media_fk FOREIGN KEY (media_item_id, part_id)
    REFERENCES title_parts(media_item_id, id)
);
--> statement-breakpoint
CREATE INDEX provider_part_snapshot_links_snapshot_idx ON provider_part_snapshot_links(snapshot_id);
--> statement-breakpoint
CREATE INDEX provider_part_snapshot_links_part_idx ON provider_part_snapshot_links(media_item_id, part_id);
--> statement-breakpoint
CREATE INDEX provider_part_snapshot_links_part_id_idx ON provider_part_snapshot_links(part_id);
