INSERT INTO "jobs" ("code", "type", "payload", "cron_expression", "next_run_at", "enabled")
VALUES
  ('auth-email-outbox-delivery', 'auth.email-outbox-delivery', '{}'::jsonb, '* * * * *', now(), false),
  ('auth-cleanup', 'auth.cleanup', '{}'::jsonb, '0 3 * * *', now(), false)
ON CONFLICT ("code") DO NOTHING;
