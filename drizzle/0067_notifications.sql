CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_recipient_type_check" CHECK ("recipient_type" in ('admin', 'author')),
	CONSTRAINT "notifications_type_check" CHECK (btrim("type") <> ''),
	CONSTRAINT "notifications_title_check" CHECK (btrim("title") <> ''),
	CONSTRAINT "notifications_body_check" CHECK (btrim("body") <> ''),
	CONSTRAINT "notifications_entity_type_check" CHECK (btrim("entity_type") <> ''),
	CONSTRAINT "notifications_entity_id_check" CHECK (btrim("entity_id") <> '')
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_type","recipient_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_type","recipient_id") WHERE "read_at" is null;
