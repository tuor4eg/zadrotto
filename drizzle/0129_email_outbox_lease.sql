-- Deploy with old workers stopped. Run tools/check-email-lease-cutover.ts first.
-- Historical requests are not stored: equal body/account and the Resend 24h
-- idempotency window cannot be proven from these rows. Never automatically resend.
ALTER TABLE email_outbox ADD COLUMN lease_token text;
--> statement-breakpoint
DO $$
DECLARE unresolved bigint;
BEGIN
  SELECT count(*) INTO unresolved FROM email_outbox WHERE status = 'sending';
  RAISE NOTICE 'Email lease cutover: % legacy sending messages have an unknown delivery outcome; quarantining for explicit review', unresolved;
END $$;
--> statement-breakpoint
UPDATE email_outbox SET status = 'failed',
  last_error = 'Исход предыдущей доставки неизвестен. Требуется ручная проверка перед повтором.',
  updated_at = clock_timestamp()
WHERE status = 'sending';
--> statement-breakpoint
CREATE INDEX email_outbox_sending_lease_idx ON email_outbox(updated_at, id) WHERE status = 'sending';
