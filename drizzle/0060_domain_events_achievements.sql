CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"actor_author_id" integer,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_type_check" CHECK (btrim("type") <> ''),
	CONSTRAINT "domain_events_schema_version_check" CHECK ("schema_version" >= 1),
	CONSTRAINT "domain_events_aggregate_type_check" CHECK (btrim("aggregate_type") <> ''),
	CONSTRAINT "domain_events_aggregate_id_check" CHECK (btrim("aggregate_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "domain_event_outbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_event_consumptions" (
	"event_id" uuid NOT NULL,
	"consumer_key" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_event_consumptions_event_id_consumer_key_pk" PRIMARY KEY("event_id","consumer_key"),
	CONSTRAINT "domain_event_consumptions_consumer_key_check" CHECK (btrim("consumer_key") <> '')
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code"),
	CONSTRAINT "achievements_code_check" CHECK (btrim("code") <> ''),
	CONSTRAINT "achievements_name_check" CHECK (btrim("name") <> ''),
	CONSTRAINT "achievements_description_check" CHECK (btrim("description") <> '')
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"achievement_id" integer NOT NULL,
	"source_event_id" uuid,
	"award_group_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"announced_at" timestamp with time zone,
	CONSTRAINT "user_achievements_author_achievement_unique" UNIQUE("author_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_actor_author_id_authors_id_fk" FOREIGN KEY ("actor_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD CONSTRAINT "domain_event_outbox_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "domain_event_consumptions" ADD CONSTRAINT "domain_event_consumptions_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "domain_events_type_occurred_at_idx" ON "domain_events" USING btree ("type","occurred_at");
--> statement-breakpoint
CREATE INDEX "domain_events_actor_occurred_at_idx" ON "domain_events" USING btree ("actor_author_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "domain_event_outbox_pending_idx" ON "domain_event_outbox" USING btree ("created_at") WHERE "dispatched_at" is null;
--> statement-breakpoint
CREATE INDEX "user_achievements_author_awarded_at_idx" ON "user_achievements" USING btree ("author_id","awarded_at");
--> statement-breakpoint
CREATE INDEX "user_achievements_pending_announcement_idx" ON "user_achievements" USING btree ("author_id","award_group_id","awarded_at") WHERE "announced_at" is null;
--> statement-breakpoint
INSERT INTO "achievements" ("code", "name", "description", "display_order") VALUES
	('first-rating', 'Первая оценка', 'Поставить первую оценку опубликованной записи.', 10),
	('ratings-10', '10 оценок', 'Оценить 10 опубликованных записей.', 20),
	('games-rated-10', '10 игр', 'Оценить 10 опубликованных игр.', 30),
	('films-rated-10', '10 фильмов', 'Оценить 10 опубликованных фильмов.', 40),
	('first-published-review', 'Первая опубликованная рецензия', 'Опубликовать первую рецензию.', 50)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "jobs" ("code", "type", "payload", "cron_expression", "next_run_at", "enabled", "history_retention_days")
VALUES ('domain-events-recovery', 'domain-events.dispatch', '{}', '* * * * *', now(), true, 30)
ON CONFLICT ("code") DO NOTHING;
