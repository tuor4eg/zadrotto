ALTER TABLE "archive_settings" ADD COLUMN "export_retention_days" integer DEFAULT 7 NOT NULL;
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_export_retention_days_check" CHECK ("archive_settings"."export_retention_days" between 1 and 90);
CREATE TABLE "admin_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_admin_id" integer NOT NULL,
  "entity_type" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "fields" jsonb NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sort" text NOT NULL,
  "row_count" integer,
  "file_size" integer,
  "object_key" text,
  "error_message" text,
  "expires_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_exports_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict,
  CONSTRAINT "admin_exports_entity_type_check" CHECK ("entity_type" in ('media_items', 'series')),
  CONSTRAINT "admin_exports_status_check" CHECK ("status" in ('queued', 'running', 'ready', 'failed', 'expired')),
  CONSTRAINT "admin_exports_row_count_check" CHECK ("row_count" is null or "row_count" >= 0),
  CONSTRAINT "admin_exports_file_size_check" CHECK ("file_size" is null or "file_size" >= 0)
);
CREATE INDEX "admin_exports_created_at_idx" ON "admin_exports" USING btree ("created_at");
CREATE INDEX "admin_exports_owner_created_idx" ON "admin_exports" USING btree ("created_by_admin_id", "created_at");
CREATE INDEX "admin_exports_status_expires_idx" ON "admin_exports" USING btree ("status", "expires_at");
INSERT INTO "jobs" ("code", "type", "payload", "options", "cron_expression", "next_run_at", "enabled")
VALUES ('admin-export-cleanup', 'admin.export-cleanup', '{}'::jsonb, '{}'::jsonb, '15 3 * * *', now(), true)
ON CONFLICT ("code") DO NOTHING;
