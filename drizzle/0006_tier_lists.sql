CREATE TABLE "tier_list_quota_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_list_quota_events_kind_check" CHECK ("tier_list_quota_events"."kind" in ('created','published'))
);
--> statement-breakpoint
CREATE TABLE "tier_list_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_entries" integer DEFAULT 200 NOT NULL,
	"max_drafts" integer DEFAULT 10 NOT NULL,
	"max_published" integer DEFAULT 30 NOT NULL,
	"publications_per_day" integer DEFAULT 5 NOT NULL,
	"creations_per_day" integer DEFAULT 20 NOT NULL,
	"max_levels" integer DEFAULT 10 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_list_settings_bounds" CHECK ("tier_list_settings"."id"=1 and "tier_list_settings"."max_entries" between 1 and 1000 and "tier_list_settings"."max_levels" between 1 and 20 and "tier_list_settings"."max_drafts" between 1 and 1000 and "tier_list_settings"."max_published" between 1 and 1000 and "tier_list_settings"."publications_per_day" between 1 and 1000 and "tier_list_settings"."creations_per_day" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "tier_list_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_admin_id" integer,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tier_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"author_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"template_id" integer,
	"configuration" jsonb NOT NULL,
	"distribution" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_creation_id" uuid NOT NULL,
	"first_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_lists_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "tier_lists_status_check" CHECK ("tier_lists"."status" in ('draft','published')),
	CONSTRAINT "tier_lists_title_check" CHECK (char_length(btrim("tier_lists"."title")) between 1 and 80),
	CONSTRAINT "tier_lists_version_check" CHECK ("tier_lists"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "trust_action_rules" DROP CONSTRAINT "trust_action_rules_known_code_check";--> statement-breakpoint
ALTER TABLE "xp_action_rules" DROP CONSTRAINT "xp_action_rules_known_code_check";--> statement-breakpoint
ALTER TABLE "tier_list_quota_events" ADD CONSTRAINT "tier_list_quota_events_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_list_settings" ADD CONSTRAINT "tier_list_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_list_templates" ADD CONSTRAINT "tier_list_templates_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_list_templates" ADD CONSTRAINT "tier_list_templates_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD CONSTRAINT "tier_lists_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD CONSTRAINT "tier_lists_template_id_tier_list_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tier_list_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tier_list_quota_events_author_time_idx" ON "tier_list_quota_events" USING btree ("author_id","kind","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tier_list_templates_default_idx" ON "tier_list_templates" USING btree ("is_default") WHERE "tier_list_templates"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "tier_lists_author_creation_idx" ON "tier_lists" USING btree ("author_id","client_creation_id");--> statement-breakpoint
CREATE INDEX "tier_lists_author_status_idx" ON "tier_lists" USING btree ("author_id","status");--> statement-breakpoint
CREATE INDEX "tier_lists_public_feed_idx" ON "tier_lists" USING btree ("first_published_at","id") WHERE "tier_lists"."status"='published' and "tier_lists"."hidden_at" is null;--> statement-breakpoint
CREATE INDEX "tier_lists_author_feed_idx" ON "tier_lists" USING btree ("author_id","first_published_at","id") WHERE "tier_lists"."status"='published' and "tier_lists"."hidden_at" is null;--> statement-breakpoint
CREATE INDEX "tier_lists_title_search_idx" ON "tier_lists" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "trust_action_rules" ADD CONSTRAINT "trust_action_rules_known_code_check" CHECK ("trust_action_rules"."action_code" in ('rating.created', 'tier-list.created', 'media.published', 'series.link-existing.published', 'series.created-with-link.published', 'series.link-removal.published', 'review.published', 'bug-report.confirmed'));--> statement-breakpoint
ALTER TABLE "xp_action_rules" ADD CONSTRAINT "xp_action_rules_known_code_check" CHECK ("xp_action_rules"."action_code" in ('rating.created', 'tier-list.created', 'media.published', 'series.link-existing.published', 'series.created-with-link.published', 'series.link-removal.published', 'review.published', 'bug-report.confirmed'));
--> statement-breakpoint
INSERT INTO tier_list_templates(name,configuration,is_default) VALUES ('Классический', '{"schemaVersion":1,"levels":[{"id":"s","name":"S","color":"#ff7f7f"},{"id":"a","name":"A","color":"#ffbf7f"},{"id":"b","name":"B","color":"#ffdf7f"},{"id":"c","name":"C","color":"#ffff7f"},{"id":"d","name":"D","color":"#bfff7f"},{"id":"f","name":"F","color":"#7fbfff"}]}',true);
--> statement-breakpoint
INSERT INTO tier_list_settings(id) VALUES (1);
--> statement-breakpoint
INSERT INTO xp_action_rules(action_code,xp,display_order) VALUES ('tier-list.created',0,8) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO trust_action_rules(action_code,trust_points,counts_toward_trust,display_order) VALUES ('tier-list.created',1,false,8) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON tier_lists FOR EACH ROW EXECUTE FUNCTION account_merge_author_write_guard('author_id');
--> statement-breakpoint
CREATE TRIGGER account_merge_guard BEFORE INSERT OR UPDATE OR DELETE ON tier_list_quota_events FOR EACH ROW EXECUTE FUNCTION account_merge_author_write_guard('author_id');
