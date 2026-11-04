ALTER TABLE "admin_activity_logs"
  ADD COLUMN "severity" text DEFAULT 'info' NOT NULL;

ALTER TABLE "admin_activity_logs"
  ADD CONSTRAINT "admin_activity_logs_severity_check"
  CHECK ("severity" IN ('info', 'warning', 'critical'));

CREATE INDEX "admin_activity_logs_severity_idx" ON "admin_activity_logs" ("severity");
