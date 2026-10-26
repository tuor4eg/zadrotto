ALTER TABLE provider_creator_bindings DROP CONSTRAINT provider_creator_bindings_values_check;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings ADD CONSTRAINT provider_creator_bindings_values_check CHECK (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$')) and (provider <> 'bgg' or external_creator_name is not null));
--> statement-breakpoint
ALTER TABLE creator_requests DROP CONSTRAINT creator_requests_identity_check;
--> statement-breakpoint
ALTER TABLE creator_requests ADD CONSTRAINT creator_requests_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$'))));
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions DROP CONSTRAINT provider_creator_exclusions_identity_check;
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions ADD CONSTRAINT provider_creator_exclusions_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$'))));
--> statement-breakpoint
INSERT INTO creator_roles(code,name) VALUES ('producer','Продюсер') ON CONFLICT(code) DO NOTHING;

--> statement-breakpoint
CREATE INDEX media_item_metadata_anilist_creators_pending_idx ON media_item_metadata(media_item_id)
WHERE source_provider in ('anilist','jikan') and source_external_id ~ '^[1-9][0-9]*$'
  and not (facts @> '{"anilistCreatorsComplete":true}'::jsonb or facts @> '{"anilistCreatorsUnavailable":true}'::jsonb);
