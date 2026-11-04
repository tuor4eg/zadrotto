CREATE TABLE "email_automation_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"delivery_interval_seconds" integer DEFAULT 60 NOT NULL,
	"delivery_batch_size" integer DEFAULT 10 NOT NULL,
	"delivery_max_attempts" integer DEFAULT 5 NOT NULL,
	"retry_base_seconds" integer DEFAULT 120 NOT NULL,
	"retry_max_seconds" integer DEFAULT 3600 NOT NULL,
	"cleanup_interval_seconds" integer DEFAULT 86400 NOT NULL,
	"challenge_retention_hours" integer DEFAULT 24 NOT NULL,
	"session_retention_days" integer DEFAULT 7 NOT NULL,
	"stale_registration_days" integer DEFAULT 7 NOT NULL,
	"sent_outbox_retention_days" integer DEFAULT 30 NOT NULL,
	"failed_outbox_retention_days" integer DEFAULT 30 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_automation_settings_singleton_id_check" CHECK ("id" = 1),
	CONSTRAINT "email_automation_delivery_interval_check" CHECK ("delivery_interval_seconds" between 60 and 3600),
	CONSTRAINT "email_automation_delivery_batch_check" CHECK ("delivery_batch_size" between 1 and 50),
	CONSTRAINT "email_automation_delivery_attempts_check" CHECK ("delivery_max_attempts" between 1 and 20),
	CONSTRAINT "email_automation_retry_base_check" CHECK ("retry_base_seconds" between 60 and 86400),
	CONSTRAINT "email_automation_retry_max_check" CHECK ("retry_max_seconds" between "retry_base_seconds" and 604800),
	CONSTRAINT "email_automation_cleanup_interval_check" CHECK ("cleanup_interval_seconds" between 3600 and 604800),
	CONSTRAINT "email_automation_challenge_retention_check" CHECK ("challenge_retention_hours" between 1 and 720),
	CONSTRAINT "email_automation_session_retention_check" CHECK ("session_retention_days" between 1 and 365),
	CONSTRAINT "email_automation_registration_retention_check" CHECK ("stale_registration_days" between 1 and 90),
	CONSTRAINT "email_automation_sent_retention_check" CHECK ("sent_outbox_retention_days" between 1 and 365),
	CONSTRAINT "email_automation_failed_retention_check" CHECK ("failed_outbox_retention_days" between 7 and 730)
);
--> statement-breakpoint
CREATE TABLE "email_automation_jobs" (
	"job" text PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_automation_jobs_job_check" CHECK ("job" in ('delivery', 'cleanup')),
	CONSTRAINT "email_automation_jobs_status_check" CHECK ("last_status" is null or "last_status" in ('success', 'failure'))
);
--> statement-breakpoint
ALTER TABLE "email_automation_settings" ADD CONSTRAINT "email_automation_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_id_idx" ON "email_outbox" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "email_outbox_created_id_idx" ON "email_outbox" USING btree ("created_at","id");--> statement-breakpoint
INSERT INTO "email_automation_settings" ("id") VALUES (1);--> statement-breakpoint
INSERT INTO "email_automation_jobs" ("job") VALUES ('delivery'), ('cleanup');
