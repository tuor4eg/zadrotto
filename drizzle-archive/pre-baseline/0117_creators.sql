CREATE TABLE creator_types (id serial PRIMARY KEY,name text NOT NULL,code text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT creator_types_values_check CHECK (btrim(name) <> '' AND code ~ '^[a-z][a-z0-9_]*$'));
--> statement-breakpoint
CREATE TABLE creator_roles (id serial PRIMARY KEY,name text NOT NULL,code text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT creator_roles_values_check CHECK (btrim(name) <> '' AND code ~ '^[a-z][a-z0-9_]*$'));
--> statement-breakpoint
CREATE TABLE creators (id serial PRIMARY KEY,name text NOT NULL,slug text NOT NULL UNIQUE,type_id integer NOT NULL REFERENCES creator_types(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT creators_values_check CHECK (btrim(name) <> '' AND btrim(slug) <> ''));
--> statement-breakpoint
CREATE TABLE entry_creators (entry_id integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,creator_id integer NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,role_id integer NOT NULL REFERENCES creator_roles(id) ON DELETE RESTRICT,is_manual boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(entry_id,creator_id,role_id));
--> statement-breakpoint
CREATE TABLE creator_series (creator_id integer NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,series_id integer NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,PRIMARY KEY(creator_id,series_id));
--> statement-breakpoint
CREATE TABLE provider_creator_mappings (id serial PRIMARY KEY,provider text NOT NULL,media_type text NOT NULL REFERENCES media_types(code),external_creator_name text NOT NULL,normalized_external_creator_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),creator_id integer NOT NULL REFERENCES creators(id) ON DELETE RESTRICT);
--> statement-breakpoint
CREATE TABLE provider_creator_exclusions (id serial PRIMARY KEY,provider text NOT NULL,media_type text NOT NULL REFERENCES media_types(code),external_creator_name text NOT NULL,normalized_external_creator_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE creator_requests (id serial PRIMARY KEY,provider text NOT NULL,media_type text NOT NULL REFERENCES media_types(code),external_creator_name text NOT NULL,normalized_external_creator_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),decision text,resolved_by_admin_id integer REFERENCES admin_users(id) ON DELETE SET NULL,resolved_at timestamptz,job_run_id integer REFERENCES job_runs(id) ON DELETE SET NULL,apply_status text NOT NULL DEFAULT 'pending',job_error text,first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),manually_reopened boolean NOT NULL DEFAULT false,CONSTRAINT creator_requests_decision_check CHECK (decision IS NULL OR decision IN ('create','map','exclude')),CONSTRAINT creator_requests_status_check CHECK (apply_status IN ('pending','applying','processed','failed')));
--> statement-breakpoint
CREATE TABLE creator_request_media_items (request_id integer NOT NULL REFERENCES creator_requests(id) ON DELETE CASCADE,media_item_id integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,external_creator_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(request_id,media_item_id));
--> statement-breakpoint
CREATE TABLE entry_creator_sources (entry_id integer NOT NULL,creator_id integer NOT NULL,role_id integer NOT NULL,provider text NOT NULL,normalized_external_creator_name text NOT NULL,PRIMARY KEY(entry_id,creator_id,role_id,provider,normalized_external_creator_name),FOREIGN KEY(entry_id,creator_id,role_id) REFERENCES entry_creators(entry_id,creator_id,role_id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX creators_type_id_idx ON creators (type_id);
--> statement-breakpoint
CREATE INDEX entry_creators_creator_role_idx ON entry_creators (creator_id,role_id,entry_id);
--> statement-breakpoint
CREATE INDEX entry_creators_role_idx ON entry_creators (role_id);
--> statement-breakpoint
CREATE INDEX creator_series_series_idx ON creator_series (series_id);
--> statement-breakpoint
CREATE INDEX provider_creator_mappings_creator_idx ON provider_creator_mappings (creator_id);
--> statement-breakpoint
CREATE INDEX creator_requests_job_idx ON creator_requests (job_run_id);
--> statement-breakpoint
CREATE INDEX creator_request_media_items_entry_idx ON creator_request_media_items (media_item_id);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_mappings_key_unique ON provider_creator_mappings (provider,media_type,normalized_external_creator_name);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_creator_exclusions_key_unique ON provider_creator_exclusions (provider,media_type,normalized_external_creator_name);
--> statement-breakpoint
CREATE UNIQUE INDEX creator_requests_key_unique ON creator_requests (provider,media_type,normalized_external_creator_name);
--> statement-breakpoint
CREATE INDEX creator_requests_pending_idx ON creator_requests(first_seen_at,id) WHERE decision IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX job_runs_creator_request_apply_active_unique ON job_runs ((payload->>'requestId')) WHERE type='media.creator-request-apply' AND status IN ('queued','running');
--> statement-breakpoint
CREATE FUNCTION protect_creator_reference_code() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'Creator reference code is immutable'; END IF; RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER creator_types_immutable_code BEFORE UPDATE OF code ON creator_types FOR EACH ROW EXECUTE FUNCTION protect_creator_reference_code();
--> statement-breakpoint
CREATE TRIGGER creator_roles_immutable_code BEFORE UPDATE OF code ON creator_roles FOR EACH ROW EXECUTE FUNCTION protect_creator_reference_code();
--> statement-breakpoint
INSERT INTO creator_types(name,code) VALUES ('Человек','person') ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
INSERT INTO creator_roles(name,code) VALUES ('Писатель','writer') ON CONFLICT(code) DO NOTHING;
