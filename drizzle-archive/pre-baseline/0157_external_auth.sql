DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM author_auth_identities GROUP BY author_id, provider HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate author/provider identities: resolve explicitly before external auth migration';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE author_auth_identities ADD CONSTRAINT author_auth_identities_author_provider_unique UNIQUE (author_id, provider);
--> statement-breakpoint
ALTER TABLE authors ADD COLUMN name_source_identity_id integer REFERENCES author_auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN avatar_source_identity_id integer REFERENCES author_auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN avatar_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE author_sessions ADD COLUMN identity_id integer REFERENCES author_auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN provider text;
--> statement-breakpoint
CREATE INDEX author_sessions_identity_id_idx ON author_sessions(identity_id);
--> statement-breakpoint
ALTER TABLE author_sessions DROP CONSTRAINT author_sessions_auth_method_check;
--> statement-breakpoint
ALTER TABLE author_sessions ADD CONSTRAINT author_sessions_auth_method_check CHECK (auth_method IN ('password', 'access_token', 'telegram', 'external'));

--> statement-breakpoint
CREATE INDEX authors_name_source_identity_id_idx ON authors(name_source_identity_id);
--> statement-breakpoint
CREATE INDEX authors_avatar_source_identity_id_idx ON authors(avatar_source_identity_id);

--> statement-breakpoint
CREATE INDEX domain_events_author_registration_idx ON domain_events(aggregate_id)
  WHERE type = 'author.registration.submitted' AND aggregate_type = 'author';
