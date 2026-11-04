ALTER TABLE "archive_settings" ADD COLUMN "media_auto_moderation_mode" text DEFAULT 'off' NOT NULL;
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_media_auto_moderation_mode_check" CHECK ("media_auto_moderation_mode" in ('off', 'shadow', 'enforce'));

ALTER TABLE "media_items" ADD COLUMN "moderation_revision" integer DEFAULT 0 NOT NULL;
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_moderation_revision_check" CHECK ("moderation_revision" >= 0);

CREATE TABLE "media_item_provider_snapshots" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"provider_code" text NOT NULL,
	"external_id" text NOT NULL,
	"media_type" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"release_year" integer,
	"source_url" text,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_provider_snapshots_provider_check" CHECK (btrim("provider_code") <> ''),
	CONSTRAINT "media_item_provider_snapshots_external_id_check" CHECK (btrim("external_id") <> ''),
	CONSTRAINT "media_item_provider_snapshots_title_check" CHECK (btrim("title") <> '')
);
ALTER TABLE "media_item_provider_snapshots" ADD CONSTRAINT "media_item_provider_snapshots_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "media_item_provider_snapshots" ADD CONSTRAINT "media_item_provider_snapshots_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;
CREATE INDEX "media_item_provider_snapshots_provider_external_idx" ON "media_item_provider_snapshots" USING btree ("provider_code", "external_id");

CREATE TABLE "automoderation_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_key" text NOT NULL,
	"subject_revision" integer NOT NULL,
	"policy_code" text NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"check_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"auto_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automoderation_checks_subject_type_check" CHECK (btrim("subject_type") <> ''),
	CONSTRAINT "automoderation_checks_subject_key_check" CHECK (btrim("subject_key") <> ''),
	CONSTRAINT "automoderation_checks_subject_revision_check" CHECK ("subject_revision" >= 1),
	CONSTRAINT "automoderation_checks_policy_code_check" CHECK (btrim("policy_code") <> ''),
	CONSTRAINT "automoderation_checks_policy_version_check" CHECK ("policy_version" >= 1),
	CONSTRAINT "automoderation_checks_mode_check" CHECK ("mode" in ('shadow', 'enforce')),
	CONSTRAINT "automoderation_checks_status_check" CHECK ("status" in ('pending', 'running', 'completed', 'stale')),
	CONSTRAINT "automoderation_checks_decision_check" CHECK ("decision" is null or "decision" in ('AUTO_APPROVE', 'NEEDS_REVIEW'))
);
ALTER TABLE "automoderation_checks" ADD CONSTRAINT "automoderation_checks_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "automoderation_checks_source_event_unique" ON "automoderation_checks" USING btree ("source_event_id");
CREATE UNIQUE INDEX "automoderation_checks_subject_revision_unique" ON "automoderation_checks" USING btree ("subject_type", "subject_key", "subject_revision");
CREATE INDEX "automoderation_checks_pending_idx" ON "automoderation_checks" USING btree ("status", "created_at") WHERE "status" in ('pending', 'running');
CREATE UNIQUE INDEX "job_runs_automoderation_active_unique" ON "job_runs" USING btree (("payload"->>'checkId')) WHERE "type" = 'moderation.auto-check' and "status" in ('queued', 'running');

ALTER TABLE "notification_transport_routes" DROP CONSTRAINT "notification_transport_routes_code_check";
ALTER TABLE "notification_transport_routes" ADD CONSTRAINT "notification_transport_routes_code_check" CHECK ("code" in ('submission_created', 'bug_report_created', 'auto_moderation_approved'));
INSERT INTO "notification_transport_routes" ("code", "transport_codes", "created_at", "updated_at")
SELECT 'auto_moderation_approved', "transport_codes", now(), now()
FROM "notification_transport_routes"
WHERE "code" = 'submission_created'
ON CONFLICT ("code") DO NOTHING;
