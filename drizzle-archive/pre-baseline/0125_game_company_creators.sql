ALTER TABLE provider_creator_bindings ADD COLUMN active boolean NOT NULL DEFAULT true;
--> statement-breakpoint
DROP INDEX provider_creator_bindings_identity_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_bindings_identity_unique ON provider_creator_bindings(provider,external_creator_id) WHERE active;
--> statement-breakpoint
INSERT INTO creator_types(name,code) VALUES('Организация','organization') ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
INSERT INTO creator_roles(name,code) VALUES('Разработчик','developer'),('Издатель','publisher') ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings DROP CONSTRAINT provider_creator_bindings_values_check, ADD CONSTRAINT provider_creator_bindings_values_check CHECK (((provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$') OR (provider='igdb' AND external_creator_id ~ '^company:[1-9][0-9]*$') OR (provider='rawg' AND external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$')) AND (provider <> 'bgg' OR external_creator_name IS NOT NULL));
--> statement-breakpoint
ALTER TABLE creator_requests DROP CONSTRAINT creator_requests_identity_check, ADD CONSTRAINT creator_requests_identity_check CHECK(external_creator_id IS NULL OR ((provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$') OR (provider='igdb' AND external_creator_id ~ '^company:[1-9][0-9]*$') OR (provider='rawg' AND external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$')));
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions DROP CONSTRAINT provider_creator_exclusions_identity_check, ADD CONSTRAINT provider_creator_exclusions_identity_check CHECK(external_creator_id IS NULL OR ((provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$') OR (provider='igdb' AND external_creator_id ~ '^company:[1-9][0-9]*$') OR (provider='rawg' AND external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$')));
--> statement-breakpoint
ALTER TABLE creators DROP CONSTRAINT creators_avatar_check, ADD CONSTRAINT creators_avatar_check CHECK ((
    (avatar_object_key is null and avatar_source is null and avatar_content_hash is null
      and avatar_source_external_id is null and avatar_source_url is null and avatar_original_url is null and avatar_fetched_at is null)
    or (avatar_object_key is not null and avatar_source is not null and avatar_source in ('manual','fantlab','igdb','rawg')
      and avatar_content_hash is not null and avatar_content_hash ~ '^[0-9a-f]{64}$'
      and avatar_object_key ~ '^avatars/creators/[1-9][0-9]*/[0-9a-f-]{36}[.]webp$'
      and ((avatar_source = 'manual' and avatar_source_external_id is null and avatar_source_url is null and avatar_original_url is null and avatar_fetched_at is null)
        or (avatar_source in ('fantlab','igdb','rawg') and avatar_source_external_id is not null and ((avatar_source = 'fantlab' and avatar_source_external_id ~ '^[1-9][0-9]*$') or (avatar_source = 'igdb' and avatar_source_external_id ~ '^company:[1-9][0-9]*$') or (avatar_source = 'rawg' and avatar_source_external_id ~ '^(developer|publisher):[1-9][0-9]*$'))
          and avatar_source_url is not null and avatar_original_url is not null and avatar_fetched_at is not null)))
  ) and avatar_version >= 0);
--> statement-breakpoint
CREATE TABLE game_company_profiles (
 provider text NOT NULL, external_id text NOT NULL, name text NOT NULL, source_url text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, image_url text, image_object_key text, image_content_hash text,
 profile_status text NOT NULL DEFAULT 'pending', image_status text NOT NULL DEFAULT 'pending', error text, fetched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,external_id),
 CONSTRAINT game_company_profiles_identity_check CHECK((provider='igdb' AND external_id ~ '^company:[1-9][0-9]*$') OR (provider='rawg' AND external_id ~ '^(developer|publisher):[1-9][0-9]*$')),
 CONSTRAINT game_company_profiles_status_check CHECK(profile_status IN ('pending','ready','missing') AND image_status IN ('pending','ready','missing'))
);
--> statement-breakpoint
CREATE TABLE game_company_rosters (
 media_item_id integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 provider text NOT NULL, source_external_id text NOT NULL, "references" jsonb NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(media_item_id,provider), CONSTRAINT game_company_rosters_provider_check CHECK(provider IN ('igdb','rawg'))
);
--> statement-breakpoint
CREATE INDEX game_company_rosters_references_idx ON game_company_rosters USING gin("references");
--> statement-breakpoint
CREATE INDEX game_company_rosters_provider_entry_idx ON game_company_rosters(provider,media_item_id);
--> statement-breakpoint
CREATE TABLE game_company_backfills (
 id serial PRIMARY KEY, version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'active',
 job_run_id integer REFERENCES job_runs(id) ON DELETE SET NULL,
 created_by_admin_id integer REFERENCES admin_users(id) ON DELETE SET NULL,
 finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT game_company_backfills_status_check CHECK(status IN ('active','completed','partial'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX game_company_backfills_active_unique ON game_company_backfills(version) WHERE status='active';
--> statement-breakpoint
CREATE TABLE game_company_backfill_items (
 backfill_id integer NOT NULL REFERENCES game_company_backfills(id) ON DELETE CASCADE,
 media_item_id integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 provider text NOT NULL, source_external_id text NOT NULL, status text NOT NULL DEFAULT 'pending',
 "references" jsonb, attempts integer NOT NULL DEFAULT 0, error text,
 used_bindings integer NOT NULL DEFAULT 0, new_requests integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(backfill_id,media_item_id,provider),
 CONSTRAINT game_company_backfill_items_values_check CHECK(provider IN ('igdb','rawg') AND status IN ('pending','ready','done','error','skipped') AND attempts>=0)
);
--> statement-breakpoint
CREATE INDEX game_company_backfill_items_pending_idx ON game_company_backfill_items(backfill_id,status,media_item_id);
--> statement-breakpoint
CREATE UNIQUE INDEX job_runs_game_company_backfill_active_unique ON job_runs(type) WHERE type='media.game-companies-backfill' AND status IN ('queued','running');
