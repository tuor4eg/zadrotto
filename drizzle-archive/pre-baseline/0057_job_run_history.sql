ALTER TABLE "jobs" ADD COLUMN "history_retention_days" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_history_retention_days_check" CHECK ("history_retention_days" between 1 and 365);
--> statement-breakpoint
CREATE INDEX "job_runs_job_finished_idx" ON "job_runs" USING btree ("job_id", "finished_at");
--> statement-breakpoint
INSERT INTO "jobs" (
  "code",
  "type",
  "payload",
  "cron_expression",
  "next_run_at",
  "enabled",
  "history_retention_days"
)
VALUES (
  'jobs-history-cleanup',
  'jobs.cleanup-history',
  '{}'::jsonb,
  '30 3 * * *',
  now(),
  true,
  30
)
ON CONFLICT ("code") DO NOTHING;
