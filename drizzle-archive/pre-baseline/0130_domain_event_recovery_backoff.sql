ALTER TABLE domain_event_outbox ADD COLUMN next_attempt_at timestamptz;
--> statement-breakpoint
UPDATE domain_event_outbox SET next_attempt_at = created_at;
--> statement-breakpoint
ALTER TABLE domain_event_outbox ALTER COLUMN next_attempt_at SET DEFAULT now(), ALTER COLUMN next_attempt_at SET NOT NULL;
--> statement-breakpoint
DROP INDEX domain_event_outbox_pending_idx;
--> statement-breakpoint
CREATE INDEX domain_event_outbox_pending_idx ON domain_event_outbox(next_attempt_at, event_id) WHERE dispatched_at IS NULL;
