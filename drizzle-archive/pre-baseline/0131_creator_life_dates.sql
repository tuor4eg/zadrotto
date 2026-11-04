ALTER TABLE creators ADD COLUMN birth_date date, ADD COLUMN death_date date;
--> statement-breakpoint
CREATE INDEX provider_creator_bindings_active_creator_idx ON provider_creator_bindings (provider, creator_id) WHERE active;
