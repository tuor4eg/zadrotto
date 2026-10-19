CREATE TABLE platform_provider_profiles (
 provider text NOT NULL, external_id text NOT NULL, name text NOT NULL, normalized_name text NOT NULL,
 is_available boolean NOT NULL DEFAULT true,
 source_url text, image_id text, image_url text, image_key text, image_object_key text, image_content_hash text,
 profile_fetched_at timestamptz, image_fetched_at timestamptz, image_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,external_id),
 CONSTRAINT platform_provider_profiles_provider_check CHECK(provider IN ('igdb','rawg')),
 CONSTRAINT platform_provider_profiles_id_check CHECK(external_id ~ '^[1-9][0-9]*$')
);
CREATE INDEX platform_provider_profiles_asset_idx ON platform_provider_profiles(provider,image_key) WHERE image_object_key IS NOT NULL AND image_content_hash IS NOT NULL;
CREATE INDEX platform_provider_profiles_image_idx ON platform_provider_profiles(image_object_key) WHERE image_object_key IS NOT NULL;
CREATE INDEX platform_provider_profiles_name_idx ON platform_provider_profiles(provider,normalized_name);
--> statement-breakpoint
ALTER TABLE platforms
 ADD COLUMN logo_mode text NOT NULL DEFAULT 'exact',
 ADD COLUMN manual_logo_object_key text,
 ADD COLUMN manual_logo_content_hash text,
 ADD COLUMN imported_logo_object_key text,
 ADD COLUMN imported_logo_content_hash text,
 ADD COLUMN imported_logo_provider text,
 ADD COLUMN imported_logo_external_id text,
 ADD COLUMN imported_logo_image_key text,
 ADD COLUMN logo_version integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT platforms_logo_mode_check CHECK(logo_mode IN ('exact','combined'));
CREATE INDEX platforms_manual_logo_idx ON platforms(manual_logo_object_key) WHERE manual_logo_object_key IS NOT NULL;
CREATE INDEX platforms_imported_logo_idx ON platforms(imported_logo_object_key) WHERE imported_logo_object_key IS NOT NULL;
--> statement-breakpoint
ALTER TABLE provider_platform_mappings ADD COLUMN external_platform_id text,
 ADD CONSTRAINT platform_mapping_external_fk FOREIGN KEY(provider,external_platform_id) REFERENCES platform_provider_profiles(provider,external_id);
CREATE INDEX platform_mappings_external_idx ON provider_platform_mappings(provider,external_platform_id,platform_id);
--> statement-breakpoint
ALTER TABLE platform_requests
 ADD COLUMN kind text NOT NULL DEFAULT 'mapping',
 ADD COLUMN target_platform_id integer REFERENCES platforms(id) ON DELETE SET NULL,
 ADD COLUMN proposal_key text,
 ADD COLUMN proposal jsonb,
 ADD COLUMN superseded boolean NOT NULL DEFAULT false,
 ADD COLUMN auto_approved boolean NOT NULL DEFAULT false,
 ADD COLUMN auto_approval_blocked boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT platform_requests_kind_check CHECK(kind IN ('mapping','logo') AND (kind='mapping' OR (proposal_key IS NOT NULL AND proposal IS NOT NULL)));
DROP INDEX platform_requests_pending_idx;
CREATE INDEX platform_requests_pending_idx ON platform_requests(first_seen_at,id) WHERE decision IS NULL AND NOT superseded;
DROP INDEX platform_requests_key_unique_idx;
CREATE UNIQUE INDEX platform_requests_key_unique_idx ON platform_requests(provider,media_type,normalized_external_platform_name) WHERE kind='mapping';
CREATE UNIQUE INDEX platform_requests_proposal_unique_idx ON platform_requests(kind,proposal_key) WHERE kind<>'mapping';
CREATE INDEX platform_requests_target_idx ON platform_requests(target_platform_id,kind,id);
CREATE INDEX platform_requests_logo_evidence_idx ON platform_requests(target_platform_id,(proposal->>'provider'),(proposal->>'externalId'),(proposal->>'imageKey')) WHERE kind='logo' AND decision='map' AND apply_status='processed';
--> statement-breakpoint
CREATE INDEX job_runs_journal_active_idx ON job_runs((CASE WHEN status IN ('queued','running') THEN 0 ELSE 1 END),created_at DESC,id DESC);
CREATE INDEX job_runs_platform_catalogue_idx ON job_runs(id) WHERE type='media.platform-logos-sync' AND payload->'checkpoint'->>'stage'='complete';
CREATE UNIQUE INDEX job_runs_platform_logos_active_idx ON job_runs(type) WHERE type='media.platform-logos-sync' AND status IN ('queued','running');
