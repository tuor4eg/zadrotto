CREATE TABLE "level_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'disabled' NOT NULL,
  "enabled_at" timestamp with time zone,
  "max_locked_level" integer DEFAULT 0 NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "level_settings_singleton_id_check" CHECK ("id" = 1),
  CONSTRAINT "level_settings_status_check" CHECK ("status" in ('disabled', 'initializing', 'enabled')),
  CONSTRAINT "level_settings_max_locked_level_check" CHECK ("max_locked_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "xp_action_rules" (
  "action_code" text PRIMARY KEY NOT NULL,
  "xp" integer NOT NULL,
  "display_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "xp_action_rules_code_check" CHECK (btrim("action_code") <> ''),
  CONSTRAINT "xp_action_rules_known_code_check" CHECK ("action_code" in ('rating.created','media.published','series.link-existing.published','series.created-with-link.published','series.link-removal.published','review.published','bug-report.confirmed')),
  CONSTRAINT "xp_action_rules_xp_check" CHECK ("xp" >= 0),
  CONSTRAINT "xp_action_rules_display_order_check" CHECK ("display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "level_thresholds" (
  "level" integer PRIMARY KEY NOT NULL,
  "xp_threshold" integer NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "level_thresholds_level_check" CHECK ("level" >= 1),
  CONSTRAINT "level_thresholds_xp_check" CHECK ("xp_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trust_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "minimum_level" integer DEFAULT 5 NOT NULL,
  "minimum_trust_points" integer DEFAULT 10 NOT NULL,
  "minimum_catalog_trust_points" integer DEFAULT 5 NOT NULL,
  "minimum_approval_rate_percent" integer DEFAULT 90 NOT NULL,
  "minimum_history_days" integer DEFAULT 14 NOT NULL,
  "auto_promotion_enabled" boolean DEFAULT true NOT NULL,
  "updated_by_admin_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trust_settings_singleton_id_check" CHECK ("id" = 1),
  CONSTRAINT "trust_settings_minimum_level_check" CHECK ("minimum_level" >= 1),
  CONSTRAINT "trust_settings_minimum_trust_points_check" CHECK ("minimum_trust_points" >= 0),
  CONSTRAINT "trust_settings_minimum_catalog_trust_points_check" CHECK ("minimum_catalog_trust_points" >= 0),
  CONSTRAINT "trust_settings_minimum_approval_rate_check" CHECK ("minimum_approval_rate_percent" between 0 and 100),
  CONSTRAINT "trust_settings_minimum_history_days_check" CHECK ("minimum_history_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trust_action_rules" (
  "action_code" text PRIMARY KEY NOT NULL,
  "trust_points" integer NOT NULL,
  "catalog_trust_points" integer NOT NULL,
  "counts_toward_approval_rate" boolean DEFAULT true NOT NULL,
  "display_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trust_action_rules_code_check" CHECK (btrim("action_code") <> ''),
  CONSTRAINT "trust_action_rules_known_code_check" CHECK ("action_code" in ('rating.created','media.published','series.link-existing.published','series.created-with-link.published','series.link-removal.published','review.published','bug-report.confirmed')),
  CONSTRAINT "trust_action_rules_points_check" CHECK ("trust_points" >= 0 and "catalog_trust_points" >= 0),
  CONSTRAINT "trust_action_rules_display_order_check" CHECK ("display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "author_progress" (
  "author_id" integer PRIMARY KEY NOT NULL,
  "xp_total" integer DEFAULT 0 NOT NULL,
  "current_level" integer DEFAULT 1 NOT NULL,
  "max_achieved_level" integer DEFAULT 1 NOT NULL,
  "initialized_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_progress_xp_check" CHECK ("xp_total" >= 0),
  CONSTRAINT "author_progress_level_check" CHECK ("current_level" >= 1 and "max_achieved_level" >= "current_level")
);
--> statement-breakpoint
CREATE TABLE "author_trust" (
  "author_id" integer PRIMARY KEY NOT NULL,
  "trust_points" integer DEFAULT 0 NOT NULL,
  "catalog_trust_points" integer DEFAULT 0 NOT NULL,
  "successful_outcomes" integer DEFAULT 0 NOT NULL,
  "rejected_outcomes" integer DEFAULT 0 NOT NULL,
  "first_qualifying_action_at" timestamp with time zone,
  "auto_trusted_at" timestamp with time zone,
  "auto_trust_suppressed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_trust_non_negative_check" CHECK ("trust_points" >= 0 and "catalog_trust_points" >= 0 and "successful_outcomes" >= 0 and "rejected_outcomes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "author_action_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_id" integer NOT NULL,
  "action_code" text NOT NULL,
  "entry_kind" text NOT NULL,
  "source_type" text NOT NULL,
  "source_key" text NOT NULL,
  "source_event_id" uuid,
  "idempotency_key" text NOT NULL UNIQUE,
  "reward_key" text,
  "xp_delta" integer DEFAULT 0 NOT NULL,
  "trust_delta" integer DEFAULT 0 NOT NULL,
  "catalog_trust_delta" integer DEFAULT 0 NOT NULL,
  "outcome" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "author_action_ledger_action_code_check" CHECK (btrim("action_code") <> ''),
  CONSTRAINT "author_action_ledger_source_check" CHECK (btrim("source_type") <> '' and btrim("source_key") <> '' and btrim("idempotency_key") <> ''),
  CONSTRAINT "author_action_ledger_delta_check" CHECK ("xp_delta" >= 0 and "trust_delta" >= 0 and "catalog_trust_delta" >= 0),
  CONSTRAINT "author_action_ledger_entry_kind_check" CHECK ("entry_kind" in ('reward', 'outcome')),
  CONSTRAINT "author_action_ledger_entry_shape_check" CHECK (("entry_kind" = 'reward' and "reward_key" is not null and "outcome" is null) or ("entry_kind" = 'outcome' and "reward_key" is null and "xp_delta" = 0 and "trust_delta" = 0 and "catalog_trust_delta" = 0 and "outcome" is not null)),
  CONSTRAINT "author_action_ledger_outcome_check" CHECK ("outcome" is null or "outcome" in ('published', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "level_settings" ADD CONSTRAINT "level_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null;
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null;
ALTER TABLE "author_progress" ADD CONSTRAINT "author_progress_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade;
ALTER TABLE "author_trust" ADD CONSTRAINT "author_trust_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade;
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade;
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "author_progress_level_author_idx" ON "author_progress" ("current_level", "author_id");
CREATE INDEX "author_trust_points_author_idx" ON "author_trust" ("trust_points", "author_id");
CREATE INDEX "author_trust_catalog_points_author_idx" ON "author_trust" ("catalog_trust_points", "author_id");
CREATE INDEX "author_action_ledger_author_occurred_idx" ON "author_action_ledger" ("author_id", "occurred_at", "id");
CREATE INDEX "author_action_ledger_source_idx" ON "author_action_ledger" ("source_type", "source_key");
CREATE INDEX "author_action_ledger_source_event_idx" ON "author_action_ledger" ("source_event_id");
CREATE UNIQUE INDEX "author_action_ledger_reward_unique" ON "author_action_ledger" ("reward_key") WHERE "entry_kind" = 'reward';
CREATE INDEX "media_item_franchises_created_by_author_idx" ON "media_item_franchises" ("created_by_author_id");
CREATE UNIQUE INDEX "job_runs_reputation_initialize_active_unique" ON "job_runs" ("type") WHERE "type" = 'reputation.initialize' and "status" in ('queued', 'running');
--> statement-breakpoint
INSERT INTO "level_settings" ("id") VALUES (1);
INSERT INTO "trust_settings" ("id") VALUES (1);
INSERT INTO "level_thresholds" ("level", "xp_threshold") VALUES
  (1, 0), (2, 20), (3, 60), (4, 120), (5, 220),
  (6, 350), (7, 550), (8, 800), (9, 1150), (10, 1550);
INSERT INTO "xp_action_rules" ("action_code", "xp", "display_order") VALUES
  ('rating.created', 1, 10),
  ('series.link-existing.published', 2, 20),
  ('series.link-removal.published', 2, 30),
  ('series.created-with-link.published', 4, 40),
  ('media.published', 5, 50),
  ('bug-report.confirmed', 5, 60),
  ('review.published', 10, 70);
INSERT INTO "trust_action_rules" ("action_code", "trust_points", "catalog_trust_points", "counts_toward_approval_rate", "display_order") VALUES
  ('rating.created', 0, 0, false, 10),
  ('series.link-existing.published', 1, 1, true, 20),
  ('series.link-removal.published', 1, 1, true, 30),
  ('series.created-with-link.published', 1, 1, true, 40),
  ('media.published', 1, 1, true, 50),
  ('bug-report.confirmed', 1, 0, true, 60),
  ('review.published', 1, 0, true, 70);
