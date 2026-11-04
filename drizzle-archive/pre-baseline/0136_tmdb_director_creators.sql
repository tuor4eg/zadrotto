ALTER TABLE provider_creator_bindings DROP CONSTRAINT provider_creator_bindings_values_check;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings ADD CONSTRAINT provider_creator_bindings_values_check CHECK (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|person):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$')) and (provider <> 'bgg' or external_creator_name is not null));
--> statement-breakpoint
ALTER TABLE creator_requests DROP CONSTRAINT creator_requests_identity_check;
--> statement-breakpoint
ALTER TABLE creator_requests ADD CONSTRAINT creator_requests_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|person):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$'))));
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions DROP CONSTRAINT provider_creator_exclusions_identity_check;
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions ADD CONSTRAINT provider_creator_exclusions_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|person):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$'))));
--> statement-breakpoint
ALTER TABLE creators DROP CONSTRAINT creators_avatar_check;
--> statement-breakpoint
ALTER TABLE creators ADD CONSTRAINT creators_avatar_check CHECK ((
    (avatar_object_key is null and avatar_source is null and avatar_content_hash is null
      and avatar_source_external_id is null and avatar_source_url is null and avatar_original_url is null and avatar_fetched_at is null)
    or (avatar_object_key is not null and avatar_source is not null and avatar_source in ('manual','fantlab','igdb','rawg','tmdb')
      and avatar_content_hash is not null and avatar_content_hash ~ '^[0-9a-f]{64}$'
      and avatar_object_key ~ '^avatars/creators/[1-9][0-9]*/[0-9a-f-]{36}[.]webp$'
      and ((avatar_source = 'manual' and avatar_source_external_id is null and avatar_source_url is null and avatar_original_url is null and avatar_fetched_at is null)
        or (avatar_source in ('fantlab','igdb','rawg','tmdb') and avatar_source_external_id is not null and ((avatar_source = 'fantlab' and avatar_source_external_id ~ '^[1-9][0-9]*$') or (avatar_source = 'igdb' and avatar_source_external_id ~ '^company:[1-9][0-9]*$') or (avatar_source = 'tmdb' and avatar_source_external_id ~ '^(company|person):[1-9][0-9]*$') or (avatar_source = 'rawg' and avatar_source_external_id ~ '^(developer|publisher):[1-9][0-9]*$'))
          and avatar_source_url is not null and avatar_original_url is not null and avatar_fetched_at is not null)))
  ) and avatar_version >= 0);
--> statement-breakpoint
INSERT INTO creator_roles (code,name) VALUES ('director','Режиссёр') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
CREATE INDEX provider_creator_mappings_name_creator_idx ON provider_creator_mappings (normalized_external_creator_name,creator_id);
--> statement-breakpoint
CREATE INDEX provider_creator_bindings_history_idx ON provider_creator_bindings (provider,external_creator_id);
