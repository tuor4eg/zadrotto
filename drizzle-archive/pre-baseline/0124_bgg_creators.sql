INSERT INTO creator_types(name,code) VALUES('Коллектив','collective') ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
INSERT INTO creator_roles(name,code) VALUES('Дизайнер','designer'),('Художник','artist') ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings ADD COLUMN external_creator_name text;
--> statement-breakpoint
ALTER TABLE provider_creator_bindings DROP CONSTRAINT provider_creator_bindings_values_check,
 ADD CONSTRAINT provider_creator_bindings_values_check CHECK(provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$' AND (provider <> 'bgg' OR external_creator_name IS NOT NULL));
--> statement-breakpoint
ALTER TABLE creator_requests ADD COLUMN external_creator_id text,
 ADD CONSTRAINT creator_requests_identity_check CHECK(external_creator_id IS NULL OR (provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$'));
--> statement-breakpoint
DROP INDEX creator_requests_key_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX creator_requests_key_unique ON creator_requests(provider,media_type,normalized_external_creator_name) WHERE external_creator_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX creator_requests_identity_unique ON creator_requests(provider,external_creator_id) WHERE external_creator_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE provider_creator_exclusions ADD COLUMN external_creator_id text,
 ADD CONSTRAINT provider_creator_exclusions_identity_check CHECK(external_creator_id IS NULL OR (provider IN ('fantlab','bgg') AND external_creator_id ~ '^[1-9][0-9]*$'));
--> statement-breakpoint
DROP INDEX provider_creator_exclusions_key_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_exclusions_key_unique ON provider_creator_exclusions(provider,media_type,normalized_external_creator_name) WHERE external_creator_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_exclusions_identity_unique ON provider_creator_exclusions(provider,external_creator_id) WHERE external_creator_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE creator_request_media_items ADD COLUMN role_id integer REFERENCES creator_roles(id) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE creator_request_media_items SET role_id=(SELECT id FROM creator_roles WHERE code='writer');
--> statement-breakpoint
ALTER TABLE creator_request_media_items ALTER COLUMN role_id SET NOT NULL, DROP CONSTRAINT creator_request_media_items_pkey, ADD PRIMARY KEY(request_id,media_item_id,role_id);
--> statement-breakpoint
ALTER TABLE entry_creator_sources ADD COLUMN binding_id integer,
 ADD CONSTRAINT entry_creator_sources_binding_owner_fk FOREIGN KEY(binding_id,creator_id,provider) REFERENCES provider_creator_bindings(id,creator_id,provider) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX entry_creator_sources_binding_idx ON entry_creator_sources(binding_id);
