CREATE TABLE provider_snapshots (
 id serial PRIMARY KEY,
 provider_code text NOT NULL,
 resource_type text NOT NULL,
 external_id text NOT NULL,
 api_method text NOT NULL,
 request_params jsonb DEFAULT '{}'::jsonb NOT NULL,
 request_key text NOT NULL,
 payload jsonb NOT NULL,
 content_type text NOT NULL,
 payload_hash text NOT NULL,
 request_started_at timestamp(3) with time zone NOT NULL,
 fetched_at timestamp(3) with time zone NOT NULL,
 CONSTRAINT provider_snapshots_identity_check CHECK(btrim(provider_code)<>'' AND btrim(resource_type)<>'' AND btrim(external_id)<>'' AND btrim(api_method)<>''),
 CONSTRAINT provider_snapshots_params_check CHECK(jsonb_typeof(request_params)='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_snapshots_identity_unique ON provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
--> statement-breakpoint
CREATE TABLE provider_snapshot_links (
 snapshot_id integer NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 purpose text NOT NULL,
 PRIMARY KEY(snapshot_id,entity_type,entity_id,purpose),
 CONSTRAINT provider_snapshot_links_values_check CHECK(btrim(entity_type)<>'' AND btrim(entity_id)<>'' AND purpose IN ('primary','dependency'))
);
--> statement-breakpoint
CREATE INDEX provider_snapshot_links_entity_idx ON provider_snapshot_links(entity_type,entity_id,purpose,snapshot_id);
--> statement-breakpoint
ALTER TABLE entry_creator_sources ADD COLUMN source_position integer;
ALTER TABLE creator_request_media_items ADD COLUMN source_position integer;
ALTER TABLE media_item_metadata ADD COLUMN original_language text;
-- Additive only: no backfill, cleanup, scheduler registration or provider cutover.

--> statement-breakpoint
CREATE INDEX media_item_metadata_source_entry_idx ON media_item_metadata(source_provider,media_item_id);
