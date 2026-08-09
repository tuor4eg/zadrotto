CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cron_expression" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"retry_base_seconds" integer DEFAULT 60 NOT NULL,
	"retry_max_seconds" integer DEFAULT 3600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_code_unique" UNIQUE("code"),
	CONSTRAINT "jobs_code_check" CHECK (btrim("code") <> ''),
	CONSTRAINT "jobs_type_check" CHECK (btrim("type") <> ''),
	CONSTRAINT "jobs_max_attempts_check" CHECK ("max_attempts" >= 1),
	CONSTRAINT "jobs_timeout_seconds_check" CHECK ("timeout_seconds" >= 1),
	CONSTRAINT "jobs_retry_base_seconds_check" CHECK ("retry_base_seconds" >= 1),
	CONSTRAINT "jobs_retry_max_seconds_check" CHECK ("retry_max_seconds" >= "retry_base_seconds")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer,
	"retry_of_run_id" integer,
	"created_by_admin_id" integer,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"retry_base_seconds" integer NOT NULL,
	"retry_max_seconds" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lock_token" text,
	"lock_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_runs_type_check" CHECK (btrim("type") <> ''),
	CONSTRAINT "job_runs_source_check" CHECK ("source" in ('schedule', 'manual', 'event')),
	CONSTRAINT "job_runs_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "job_runs_attempts_check" CHECK ("attempts" >= 0 and "attempts" <= "max_attempts"),
	CONSTRAINT "job_runs_max_attempts_check" CHECK ("max_attempts" >= 1),
	CONSTRAINT "job_runs_timeout_seconds_check" CHECK ("timeout_seconds" >= 1),
	CONSTRAINT "job_runs_retry_base_seconds_check" CHECK ("retry_base_seconds" >= 1),
	CONSTRAINT "job_runs_retry_max_seconds_check" CHECK ("retry_max_seconds" >= "retry_base_seconds")
);
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_retry_of_run_id_job_runs_id_fk" FOREIGN KEY ("retry_of_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "jobs_scheduler_idx" ON "jobs" USING btree ("enabled","next_run_at");
--> statement-breakpoint
CREATE INDEX "job_runs_queue_idx" ON "job_runs" USING btree ("available_at","id") WHERE "status" = 'queued';
--> statement-breakpoint
CREATE INDEX "job_runs_recovery_idx" ON "job_runs" USING btree ("lock_expires_at") WHERE "status" = 'running';
--> statement-breakpoint
CREATE INDEX "job_runs_job_created_idx" ON "job_runs" USING btree ("job_id","created_at");
--> statement-breakpoint
CREATE INDEX "job_runs_type_created_idx" ON "job_runs" USING btree ("type","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_scheduled_job_occurrence_unique" ON "job_runs" USING btree ("job_id","scheduled_for") WHERE "source" = 'schedule';
