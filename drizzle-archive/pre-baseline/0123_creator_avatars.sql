ALTER TABLE creators
 ADD COLUMN avatar_object_key text,
 ADD COLUMN avatar_source text,
 ADD COLUMN avatar_source_external_id text,
 ADD COLUMN avatar_source_url text,
 ADD COLUMN avatar_original_url text,
 ADD COLUMN avatar_fetched_at timestamptz,
 ADD COLUMN avatar_content_hash text,
 ADD COLUMN avatar_version integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT creators_avatar_check CHECK ((
  (avatar_object_key IS NULL AND avatar_source IS NULL AND avatar_content_hash IS NULL
   AND avatar_source_external_id IS NULL AND avatar_source_url IS NULL AND avatar_original_url IS NULL AND avatar_fetched_at IS NULL)
  OR (avatar_object_key IS NOT NULL AND avatar_source IS NOT NULL AND avatar_source IN ('manual','fantlab')
   AND avatar_content_hash IS NOT NULL AND avatar_content_hash ~ '^[0-9a-f]{64}$'
   AND avatar_object_key ~ '^avatars/creators/[1-9][0-9]*/[0-9a-f-]{36}[.]webp$'
   AND ((avatar_source = 'manual' AND avatar_source_external_id IS NULL AND avatar_source_url IS NULL AND avatar_original_url IS NULL AND avatar_fetched_at IS NULL)
    OR (avatar_source = 'fantlab' AND avatar_source_external_id IS NOT NULL AND avatar_source_external_id ~ '^[1-9][0-9]*$'
     AND avatar_source_url IS NOT NULL AND avatar_original_url IS NOT NULL AND avatar_fetched_at IS NOT NULL)))
 ) AND avatar_version >= 0);
--> statement-breakpoint
CREATE UNIQUE INDEX creators_avatar_object_key_unique ON creators(avatar_object_key) WHERE avatar_object_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE provider_creator_bindings (
 id serial PRIMARY KEY,
 provider text NOT NULL,
 external_creator_id text NOT NULL,
 creator_id integer NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT provider_creator_bindings_values_check CHECK (provider = 'fantlab' AND external_creator_id ~ '^[1-9][0-9]*$'),
 CONSTRAINT provider_creator_bindings_owner_unique UNIQUE(id, creator_id, provider)
);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_bindings_identity_unique ON provider_creator_bindings(provider,external_creator_id);
--> statement-breakpoint
CREATE INDEX provider_creator_bindings_creator_idx ON provider_creator_bindings(creator_id);
--> statement-breakpoint
ALTER TABLE provider_creator_mappings ADD COLUMN binding_id integer,
 ADD CONSTRAINT provider_creator_mappings_binding_owner_fk FOREIGN KEY(binding_id,creator_id,provider)
 REFERENCES provider_creator_bindings(id,creator_id,provider) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX provider_creator_mappings_binding_idx ON provider_creator_mappings(binding_id);
