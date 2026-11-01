INSERT INTO media_types (code, name, description, is_publicly_available, is_available_to_guests, enabled_by_default)
VALUES ('manga', 'Манга', 'Манга, манхва, маньхуа и вебтуны', true, true, true)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO provider_settings (media_type, provider_code, enabled, title_search_mode, cover_search_enabled, priority)
VALUES ('manga', 'mangaupdates', true, 'parallel', true, 10)
ON CONFLICT (media_type, provider_code) DO NOTHING;
--> statement-breakpoint
-- Application request budget, editable in admin; not a published MangaUpdates API limit.
INSERT INTO provider_rate_limits (provider_code) VALUES ('mangaupdates')
ON CONFLICT (provider_code) DO NOTHING;
--> statement-breakpoint
INSERT INTO provider_image_settings (provider_code, proxy_images_enabled) VALUES ('mangaupdates', true)
ON CONFLICT (provider_code) DO NOTHING;
--> statement-breakpoint
INSERT INTO creator_roles (name, code) VALUES ('Писатель', 'writer'), ('Художник', 'artist'), ('Издательство', 'publisher') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings DROP CONSTRAINT provider_creator_bindings_values_check;
ALTER TABLE provider_creator_bindings ADD CONSTRAINT provider_creator_bindings_values_check CHECK (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$') or (provider in ('comic-vine','mangaupdates') and external_creator_id ~ '^(person|publisher):[1-9][0-9]*$') or (provider = 'roblox' and external_creator_id ~ '^(user|group):[1-9][0-9]*$')) and (provider <> 'bgg' or external_creator_name is not null));
ALTER TABLE creator_requests DROP CONSTRAINT creator_requests_identity_check;
ALTER TABLE creator_requests ADD CONSTRAINT creator_requests_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$') or (provider in ('comic-vine','mangaupdates') and external_creator_id ~ '^(person|publisher):[1-9][0-9]*$') or (provider = 'roblox' and external_creator_id ~ '^(user|group):[1-9][0-9]*$'))));
ALTER TABLE provider_creator_exclusions DROP CONSTRAINT provider_creator_exclusions_identity_check;
ALTER TABLE provider_creator_exclusions ADD CONSTRAINT provider_creator_exclusions_identity_check CHECK (external_creator_id is null or (((provider in ('fantlab','bgg') and external_creator_id ~ '^[1-9][0-9]*$') or (provider = 'igdb' and external_creator_id ~ '^company:[1-9][0-9]*$') or (provider = 'tmdb' and external_creator_id ~ '^(company|network|person):[1-9][0-9]*$') or (provider = 'anilist' and external_creator_id ~ '^(person|studio):[1-9][0-9]*$') or (provider = 'rawg' and external_creator_id ~ '^(developer|publisher):[1-9][0-9]*$') or (provider in ('comic-vine','mangaupdates') and external_creator_id ~ '^(person|publisher):[1-9][0-9]*$') or (provider = 'roblox' and external_creator_id ~ '^(user|group):[1-9][0-9]*$'))));

--> statement-breakpoint
CREATE INDEX media_items_shikimori_pending_idx ON media_items (media_type, id) WHERE shikimori_enrichment_attempted_at IS NULL;
