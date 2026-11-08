CREATE TABLE "account_merge_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"merge_id" uuid NOT NULL,
	"source_author_id" integer NOT NULL,
	"table_name" text NOT NULL,
	"entity_key" text NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_merge_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_author_id" integer NOT NULL,
	"initiator_session_id" integer NOT NULL,
	"secondary_author_id" integer NOT NULL,
	"identity_id" integer NOT NULL,
	"provider" text NOT NULL,
	"configuration_revision" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"result_author_id" integer,
	"result_session_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_merge_grants_distinct" CHECK ("account_merge_grants"."initiator_author_id" <> "account_merge_grants"."secondary_author_id"),
	CONSTRAINT "account_merge_grants_result" CHECK (("account_merge_grants"."consumed_at" is null and "account_merge_grants"."result_author_id" is null and "account_merge_grants"."result_session_id" is null) or ("account_merge_grants"."consumed_at" is not null and "account_merge_grants"."result_author_id" is not null and "account_merge_grants"."result_session_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "merged_into_author_id" integer;--> statement-breakpoint
ALTER TABLE "account_merge_archive" ADD CONSTRAINT "account_merge_archive_merge_id_account_merge_grants_id_fk" FOREIGN KEY ("merge_id") REFERENCES "public"."account_merge_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_archive" ADD CONSTRAINT "account_merge_archive_source_author_id_authors_id_fk" FOREIGN KEY ("source_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_grants" ADD CONSTRAINT "account_merge_grants_initiator_author_id_authors_id_fk" FOREIGN KEY ("initiator_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_grants" ADD CONSTRAINT "account_merge_grants_secondary_author_id_authors_id_fk" FOREIGN KEY ("secondary_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_grants" ADD CONSTRAINT "account_merge_grants_result_author_id_authors_id_fk" FOREIGN KEY ("result_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_merge_archive_merge_idx" ON "account_merge_archive" USING btree ("merge_id");--> statement-breakpoint
CREATE INDEX "account_merge_archive_entity_idx" ON "account_merge_archive" USING btree ("table_name","entity_key");--> statement-breakpoint
CREATE INDEX "account_merge_grants_expiry_idx" ON "account_merge_grants" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_merged_into_author_id_authors_id_fk" FOREIGN KEY ("merged_into_author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authors_merged_into_author_idx" ON "authors" USING btree ("merged_into_author_id");--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_merge_not_self" CHECK ("authors"."merged_into_author_id" is null or "authors"."merged_into_author_id" <> "authors"."id");--> statement-breakpoint
-- All mutable author references must wait for credential/merge mutations and reject tombstones.
CREATE FUNCTION account_merge_author_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document jsonb; author_ids integer[] := '{}'; author_id integer; column_name text; merged_id integer;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF TG_OP <> 'INSERT' THEN
      document := to_jsonb(OLD);
      IF document->>column_name IS NOT NULL THEN author_ids := array_append(author_ids, (document->>column_name)::integer); END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      document := to_jsonb(NEW);
      IF document->>column_name IS NOT NULL THEN author_ids := array_append(author_ids, (document->>column_name)::integer); END IF;
    END IF;
  END LOOP;
  FOR author_id IN SELECT DISTINCT unnest(author_ids) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(42001, author_id);
    SELECT merged_into_author_id INTO merged_id FROM authors WHERE id = author_id FOR UPDATE;
    IF merged_id IS NOT NULL THEN
      -- Retention cleanup must still remove already revoked/consumed ephemeral credentials.
      IF TG_OP = 'DELETE' AND (
        (TG_TABLE_NAME IN ('author_sessions', 'author_access_tokens') AND to_jsonb(OLD)->>'revoked_at' IS NOT NULL)
        OR (TG_TABLE_NAME = 'author_auth_challenges' AND to_jsonb(OLD)->>'consumed_at' IS NOT NULL)
      ) THEN CONTINUE; END IF;
      RAISE EXCEPTION 'Account has been merged' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT c.conrelid::regclass AS tbl, string_agg(DISTINCT quote_literal(a.attname), ',' ORDER BY quote_literal(a.attname)) AS columns
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'authors'::regclass
      AND c.conrelid NOT IN ('authors'::regclass, 'admin_activity_logs'::regclass, 'domain_events'::regclass,
        'account_merge_grants'::regclass, 'account_merge_archive'::regclass)
    GROUP BY c.conrelid
  LOOP
    EXECUTE format('CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION account_merge_author_write_guard(%s)', relation.tbl, relation.columns);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION account_merge_notification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_id integer; merged_id integer;
BEGIN
  FOR author_id IN SELECT DISTINCT v.id FROM (VALUES
    (CASE WHEN TG_OP <> 'INSERT' AND OLD.recipient_type = 'author' THEN OLD.recipient_id END),
    (CASE WHEN TG_OP <> 'DELETE' AND NEW.recipient_type = 'author' THEN NEW.recipient_id END)
  ) v(id) WHERE v.id IS NOT NULL ORDER BY v.id LOOP
    PERFORM pg_advisory_xact_lock(42001, author_id);
    SELECT merged_into_author_id INTO merged_id FROM authors WHERE id = author_id FOR UPDATE;
    IF merged_id IS NOT NULL THEN RAISE EXCEPTION 'Account has been merged' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION account_merge_notification_guard();
--> statement-breakpoint
CREATE FUNCTION account_merge_closed_author_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.merged_into_author_id IS NOT NULL THEN RAISE EXCEPTION 'Account has been merged' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_merge_closed_guard BEFORE UPDATE OR DELETE ON authors FOR EACH ROW EXECUTE FUNCTION account_merge_closed_author_guard();
--> statement-breakpoint
-- Child edits (review text/links) have no direct author FK.
CREATE FUNCTION account_merge_contribution_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE contribution_id integer; author_id integer; merged_id integer;
BEGIN
  FOR contribution_id IN SELECT DISTINCT v.id FROM (VALUES
    (CASE WHEN TG_OP <> 'INSERT' THEN OLD.contribution_id END),
    (CASE WHEN TG_OP <> 'DELETE' THEN NEW.contribution_id END)
  ) v(id) WHERE v.id IS NOT NULL ORDER BY v.id LOOP
    SELECT c.author_id INTO author_id FROM contributions c WHERE c.id = contribution_id;
    IF author_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(42001, author_id);
      SELECT merged_into_author_id INTO merged_id FROM authors WHERE id = author_id FOR UPDATE;
      IF merged_id IS NOT NULL THEN RAISE EXCEPTION 'Account has been merged' USING ERRCODE = '23514'; END IF;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON contribution_reviews FOR EACH ROW EXECUTE FUNCTION account_merge_contribution_write_guard();
--> statement-breakpoint
CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON contribution_media_items FOR EACH ROW EXECUTE FUNCTION account_merge_contribution_write_guard();

--> statement-breakpoint
CREATE INDEX account_merge_grants_initiator_idx ON account_merge_grants (initiator_author_id);
--> statement-breakpoint
CREATE INDEX account_merge_grants_secondary_idx ON account_merge_grants (secondary_author_id);
--> statement-breakpoint
CREATE INDEX account_merge_grants_result_idx ON account_merge_grants (result_author_id);
