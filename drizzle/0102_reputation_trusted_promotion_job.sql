INSERT INTO "jobs" (
  "code", "type", "payload", "options", "cron_expression", "next_run_at", "enabled",
  "max_attempts", "timeout_seconds", "retry_base_seconds", "retry_max_seconds", "history_retention_days"
) VALUES (
  'reputation-trusted-promotion', 'reputation.promote-trusted', '{}', '{}', '17 * * * *', now(), true,
  3, 120, 60, 3600, 30
)
ON CONFLICT ("code") DO NOTHING;
