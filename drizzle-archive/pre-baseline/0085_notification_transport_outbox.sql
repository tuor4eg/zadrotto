CREATE TABLE "notification_transport_outbox" (
	"event_id" uuid NOT NULL,
	"transport" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_transport_outbox_event_id_transport_recipient_pk" PRIMARY KEY("event_id","transport","recipient"),
	CONSTRAINT "notification_transport_outbox_status_check" CHECK ("status" in ('pending', 'sending', 'delivered', 'failed')),
	CONSTRAINT "notification_transport_outbox_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "notification_transport_outbox_transport_check" CHECK ("transport" in ('telegram')),
	CONSTRAINT "notification_transport_outbox_recipient_check" CHECK (btrim("recipient") <> '')
);
--> statement-breakpoint
ALTER TABLE "notification_transport_outbox" ADD CONSTRAINT "notification_transport_outbox_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notification_transport_outbox_delivery_idx" ON "notification_transport_outbox" USING btree ("status","next_attempt_at") WHERE "status" in ('pending', 'sending');
--> statement-breakpoint
INSERT INTO "jobs" ("code", "type", "payload", "cron_expression", "next_run_at", "enabled", "history_retention_days")
VALUES ('notification-transport-delivery', 'notifications.transport-delivery', '{}', '* * * * *', now(), true, 30)
ON CONFLICT ("code") DO NOTHING;
