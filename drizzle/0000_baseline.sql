-- Fresh-database baseline; historical migrations: drizzle-archive/pre-baseline.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('draft', 'submitted', 'published', 'rejected', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('review');--> statement-breakpoint
CREATE TYPE "public"."editorial_document_block_type" AS ENUM('media', 'heading', 'text', 'entry_group');--> statement-breakpoint
CREATE TYPE "public"."editorial_document_kind" AS ENUM('collection', 'article');--> statement-breakpoint
CREATE TYPE "public"."first_experienced_precision" AS ENUM('year', 'month', 'day');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('private', 'submitted', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "achievement_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"achievement_id" integer NOT NULL,
	"level" integer NOT NULL,
	"threshold" integer NOT NULL,
	"name" text,
	"description" text,
	"image_object_key" text,
	"rarity" text DEFAULT 'common' NOT NULL,
	"showcase_background_image_object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_levels_achievement_level_unique" UNIQUE("achievement_id","level"),
	CONSTRAINT "achievement_levels_achievement_threshold_unique" UNIQUE("achievement_id","threshold"),
	CONSTRAINT "achievement_levels_level_check" CHECK ("achievement_levels"."level" > 0),
	CONSTRAINT "achievement_levels_threshold_check" CHECK ("achievement_levels"."threshold" > 0),
	CONSTRAINT "achievement_levels_name_check" CHECK ("achievement_levels"."name" is null or btrim("achievement_levels"."name") <> ''),
	CONSTRAINT "achievement_levels_description_check" CHECK ("achievement_levels"."description" is null or btrim("achievement_levels"."description") <> ''),
	CONSTRAINT "achievement_levels_rarity_check" CHECK ("achievement_levels"."rarity" in ('common', 'rare', 'epic', 'legendary'))
);
--> statement-breakpoint
CREATE TABLE "achievement_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"locked_image_object_key" text,
	"default_showcase_background_image_object_key" text,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_settings_singleton_id_check" CHECK ("achievement_settings"."id" = 1),
	CONSTRAINT "achievement_settings_locked_image_object_key_check" CHECK ("achievement_settings"."locked_image_object_key" is null or btrim("achievement_settings"."locked_image_object_key") <> ''),
	CONSTRAINT "achievement_settings_default_showcase_background_image_object_key_check" CHECK ("achievement_settings"."default_showcase_background_image_object_key" is null or btrim("achievement_settings"."default_showcase_background_image_object_key") <> '')
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"mechanic" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"show_when_locked" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code"),
	CONSTRAINT "achievements_code_check" CHECK (btrim("achievements"."code") <> ''),
	CONSTRAINT "achievements_name_check" CHECK (btrim("achievements"."name") <> ''),
	CONSTRAINT "achievements_description_check" CHECK ("achievements"."description" is null or btrim("achievements"."description") <> ''),
	CONSTRAINT "achievements_mechanic_check" CHECK (btrim("achievements"."mechanic") <> '')
);
--> statement-breakpoint
CREATE TABLE "admin_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"admin_user_id" integer,
	"author_id" integer,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"entity_label" text,
	"status" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"message" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	CONSTRAINT "admin_activity_logs_severity_check" CHECK ("admin_activity_logs"."severity" in ('info', 'warning', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "admin_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_admin_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"fields" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" text NOT NULL,
	"row_count" integer,
	"file_size" bigint,
	"object_key" text,
	"error_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_exports_entity_type_check" CHECK ("admin_exports"."entity_type" in ('media_items', 'series', 'database_dump')),
	CONSTRAINT "admin_exports_status_check" CHECK ("admin_exports"."status" in ('queued', 'running', 'ready', 'failed', 'expired')),
	CONSTRAINT "admin_exports_row_count_check" CHECK ("admin_exports"."row_count" is null or "admin_exports"."row_count" >= 0),
	CONSTRAINT "admin_exports_file_size_check" CHECK ("admin_exports"."file_size" is null or "admin_exports"."file_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_invalidated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
CREATE TABLE "ai_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_profile_id" integer,
	"profile_key" text NOT NULL,
	"provider_code" text,
	"model_id" text,
	"status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"provider_request_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_call_logs_status_check" CHECK ("ai_call_logs"."status" in ('success', 'failure')),
	CONSTRAINT "ai_call_logs_latency_check" CHECK ("ai_call_logs"."latency_ms" >= 0),
	CONSTRAINT "ai_call_logs_input_tokens_check" CHECK ("ai_call_logs"."input_tokens" is null or "ai_call_logs"."input_tokens" >= 0),
	CONSTRAINT "ai_call_logs_output_tokens_check" CHECK ("ai_call_logs"."output_tokens" is null or "ai_call_logs"."output_tokens" >= 0),
	CONSTRAINT "ai_call_logs_error_code_check" CHECK ("ai_call_logs"."error_code" is null or "ai_call_logs"."error_code" in ('configuration', 'authentication', 'rate-limit', 'timeout', 'provider-unavailable', 'invalid-response'))
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"provider_code" text PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"key_hint" text NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_credentials_code_check" CHECK (btrim("ai_provider_credentials"."provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "ai_provider_settings" (
	"provider_code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_model_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_settings_code_check" CHECK (btrim("ai_provider_settings"."provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "ai_scenario_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"provider_code" text NOT NULL,
	"model_id" text,
	"instruction" text,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_scenario_profiles_key_check" CHECK (btrim("ai_scenario_profiles"."key") <> ''),
	CONSTRAINT "ai_scenario_profiles_provider_code_check" CHECK (btrim("ai_scenario_profiles"."provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "analytics_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "analytics_settings_singleton_check" CHECK ("analytics_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "archive_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_title_aliases" integer DEFAULT 3 NOT NULL,
	"max_franchise_depth" integer DEFAULT 3 NOT NULL,
	"daily_dossier_min_average_score" integer DEFAULT 6 NOT NULL,
	"daily_dossier_min_ratings_count" integer DEFAULT 0 NOT NULL,
	"recently_viewed_history_limit" integer DEFAULT 50 NOT NULL,
	"recently_viewed_ttl_days" integer DEFAULT 90 NOT NULL,
	"top_archive_min_average_score" integer DEFAULT 0 NOT NULL,
	"top_archive_min_ratings_count" integer DEFAULT 1 NOT NULL,
	"export_retention_days" integer DEFAULT 7 NOT NULL,
	"media_auto_moderation_mode" text DEFAULT 'off' NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_settings_singleton_id_check" CHECK ("archive_settings"."id" = 1),
	CONSTRAINT "archive_settings_max_title_aliases_check" CHECK ("archive_settings"."max_title_aliases" between 1 and 10),
	CONSTRAINT "archive_settings_max_franchise_depth_check" CHECK ("archive_settings"."max_franchise_depth" between 2 and 5),
	CONSTRAINT "archive_settings_daily_dossier_min_average_score_check" CHECK ("archive_settings"."daily_dossier_min_average_score" between 0 and 10),
	CONSTRAINT "archive_settings_daily_dossier_min_ratings_count_check" CHECK ("archive_settings"."daily_dossier_min_ratings_count" between 0 and 1000),
	CONSTRAINT "archive_settings_recently_viewed_history_limit_check" CHECK ("archive_settings"."recently_viewed_history_limit" between 1 and 500),
	CONSTRAINT "archive_settings_recently_viewed_ttl_days_check" CHECK ("archive_settings"."recently_viewed_ttl_days" between 1 and 365),
	CONSTRAINT "archive_settings_top_archive_min_average_score_check" CHECK ("archive_settings"."top_archive_min_average_score" between 0 and 10),
	CONSTRAINT "archive_settings_top_archive_min_ratings_count_check" CHECK ("archive_settings"."top_archive_min_ratings_count" between 0 and 1000),
	CONSTRAINT "archive_settings_export_retention_days_check" CHECK ("archive_settings"."export_retention_days" between 1 and 90),
	CONSTRAINT "archive_settings_media_auto_moderation_mode_check" CHECK ("archive_settings"."media_auto_moderation_mode" in ('off', 'shadow', 'enforce'))
);
--> statement-breakpoint
CREATE TABLE "auth_provider_settings" (
	"provider_code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_access_profile_media_types" (
	"access_profile_id" integer NOT NULL,
	"media_type_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_access_profile_media_types_pk" PRIMARY KEY("access_profile_id","media_type_id")
);
--> statement-breakpoint
CREATE TABLE "author_access_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"can_publish_media_without_review" boolean DEFAULT false NOT NULL,
	"can_publish_franchises_without_review" boolean DEFAULT false NOT NULL,
	"max_draft_media_items" integer,
	"max_draft_media_items_per_day" integer,
	"max_upload_bytes" integer,
	"max_files_per_media_item" integer,
	"cover_searches_per_minute" integer,
	"cover_searches_per_hour" integer,
	"cover_searches_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_access_profiles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "author_access_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_admin_id" integer NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "author_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "author_accounts" (
	"author_id" integer PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"normalized_login" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_admin_id" integer,
	"rejected_at" timestamp with time zone,
	"rejected_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_accounts_normalized_login_unique" UNIQUE("normalized_login"),
	CONSTRAINT "author_accounts_status_check" CHECK ("author_accounts"."status" in ('pending_email', 'pending_approval', 'active', 'rejected'))
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
	"idempotency_key" text NOT NULL,
	"reward_key" text,
	"xp_delta" integer DEFAULT 0 NOT NULL,
	"trust_delta" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_action_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "author_action_ledger_action_code_check" CHECK (btrim("author_action_ledger"."action_code") <> ''),
	CONSTRAINT "author_action_ledger_source_check" CHECK (btrim("author_action_ledger"."source_type") <> '' and btrim("author_action_ledger"."source_key") <> '' and btrim("author_action_ledger"."idempotency_key") <> ''),
	CONSTRAINT "author_action_ledger_delta_check" CHECK ("author_action_ledger"."xp_delta" >= 0 and "author_action_ledger"."trust_delta" >= 0),
	CONSTRAINT "author_action_ledger_entry_kind_check" CHECK ("author_action_ledger"."entry_kind" in ('reward', 'outcome')),
	CONSTRAINT "author_action_ledger_entry_shape_check" CHECK (("author_action_ledger"."entry_kind" = 'reward' and "author_action_ledger"."reward_key" is not null and "author_action_ledger"."outcome" is null) or ("author_action_ledger"."entry_kind" = 'outcome' and "author_action_ledger"."reward_key" is null and "author_action_ledger"."xp_delta" = 0 and "author_action_ledger"."trust_delta" = 0 and "author_action_ledger"."outcome" is not null)),
	CONSTRAINT "author_action_ledger_outcome_check" CHECK ("author_action_ledger"."outcome" is null or "author_action_ledger"."outcome" in ('published', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "author_archive_exploration_settings" (
	"author_id" integer PRIMARY KEY NOT NULL,
	"auto_show_enabled" boolean DEFAULT true NOT NULL,
	"last_auto_shown_at" timestamp with time zone,
	"onboarding_step" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_archive_exploration_settings_onboarding_step_check" CHECK ("author_archive_exploration_settings"."onboarding_step" between 10 and 100)
);
--> statement-breakpoint
CREATE TABLE "author_auth_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"email_id" integer,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_auth_challenges_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "author_auth_challenges_purpose_check" CHECK ("author_auth_challenges"."purpose" in ('verify_email', 'reset_password', 'change_email'))
);
--> statement-breakpoint
CREATE TABLE "author_auth_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"display_value" text,
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_auth_identities_author_provider_unique" UNIQUE("author_id","provider"),
	CONSTRAINT "author_auth_identities_provider_subject_unique" UNIQUE("provider","provider_subject")
);
--> statement-breakpoint
CREATE TABLE "author_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"verified_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_emails_normalized_email_unique" UNIQUE("normalized_email")
);
--> statement-breakpoint
CREATE TABLE "author_friendships" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_author_id" integer NOT NULL,
	"second_author_id" integer NOT NULL,
	"requested_by_author_id" integer NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_friendships_pair_unique" UNIQUE("first_author_id","second_author_id"),
	CONSTRAINT "author_friendships_canonical_pair_check" CHECK ("author_friendships"."first_author_id" < "author_friendships"."second_author_id"),
	CONSTRAINT "author_friendships_requester_member_check" CHECK ("author_friendships"."requested_by_author_id" in ("author_friendships"."first_author_id", "author_friendships"."second_author_id")),
	CONSTRAINT "author_friendships_accepted_at_check" CHECK (("author_friendships"."status" = 'accepted' and "author_friendships"."accepted_at" is not null) or ("author_friendships"."status" = 'pending' and "author_friendships"."accepted_at" is null))
);
--> statement-breakpoint
CREATE TABLE "author_media_experiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"first_experienced_at" date NOT NULL,
	"first_experienced_precision" "first_experienced_precision" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_media_experiences_media_item_id_author_id_unique" UNIQUE("media_item_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "author_media_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_media_statuses_author_media_unique" UNIQUE("author_id","media_item_id"),
	CONSTRAINT "author_media_statuses_status_check" CHECK ("author_media_statuses"."status" in ('wanted', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "author_media_type_settings" (
	"author_id" integer NOT NULL,
	"media_type_id" integer NOT NULL,
	"is_enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_media_type_settings_pk" PRIMARY KEY("author_id","media_type_id")
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
	CONSTRAINT "author_progress_xp_check" CHECK ("author_progress"."xp_total" >= 0),
	CONSTRAINT "author_progress_level_check" CHECK ("author_progress"."current_level" >= 1 and "author_progress"."max_achieved_level" >= "author_progress"."current_level")
);
--> statement-breakpoint
CREATE TABLE "author_registration_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_profile_id" integer,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_registration_settings_singleton_id_check" CHECK ("author_registration_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "author_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"auth_method" text NOT NULL,
	"identity_id" integer,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	CONSTRAINT "author_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "author_sessions_auth_method_check" CHECK ("author_sessions"."auth_method" in ('password', 'access_token', 'telegram', 'external'))
);
--> statement-breakpoint
CREATE TABLE "author_trust" (
	"author_id" integer PRIMARY KEY NOT NULL,
	"trust_points" integer DEFAULT 0 NOT NULL,
	"successful_outcomes" integer DEFAULT 0 NOT NULL,
	"rejected_outcomes" integer DEFAULT 0 NOT NULL,
	"first_qualifying_action_at" timestamp with time zone,
	"auto_trusted_at" timestamp with time zone,
	"auto_trust_suppressed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_trust_non_negative_check" CHECK ("author_trust"."trust_points" >= 0 and "author_trust"."successful_outcomes" >= 0 and "author_trust"."rejected_outcomes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"avatar_object_key" text,
	"name_source_identity_id" integer,
	"avatar_source_identity_id" integer,
	"avatar_version" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_discoverable" boolean DEFAULT true NOT NULL,
	"access_profile_id" integer NOT NULL,
	"blocked_at" timestamp with time zone,
	"blocked_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "automoderation_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_key" text NOT NULL,
	"subject_revision" integer NOT NULL,
	"policy_code" text NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"check_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"auto_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automoderation_checks_subject_type_check" CHECK (btrim("automoderation_checks"."subject_type") <> ''),
	CONSTRAINT "automoderation_checks_subject_key_check" CHECK (btrim("automoderation_checks"."subject_key") <> ''),
	CONSTRAINT "automoderation_checks_subject_revision_check" CHECK ("automoderation_checks"."subject_revision" >= 1),
	CONSTRAINT "automoderation_checks_policy_code_check" CHECK (btrim("automoderation_checks"."policy_code") <> ''),
	CONSTRAINT "automoderation_checks_policy_version_check" CHECK ("automoderation_checks"."policy_version" >= 1),
	CONSTRAINT "automoderation_checks_mode_check" CHECK ("automoderation_checks"."mode" in ('shadow', 'enforce')),
	CONSTRAINT "automoderation_checks_status_check" CHECK ("automoderation_checks"."status" in ('pending', 'running', 'completed', 'stale')),
	CONSTRAINT "automoderation_checks_decision_check" CHECK ("automoderation_checks"."decision" is null or "automoderation_checks"."decision" in ('AUTO_APPROVE', 'NEEDS_REVIEW'))
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"description" text NOT NULL,
	"url" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"client_context" jsonb,
	"confirmed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bug_reports_description_check" CHECK (char_length(btrim("bug_reports"."description")) between 1 and 2000),
	CONSTRAINT "bug_reports_url_check" CHECK (char_length("bug_reports"."url") between 1 and 2048 and left("bug_reports"."url", 1) = '/' and left("bug_reports"."url", 2) <> '//'),
	CONSTRAINT "bug_reports_entity_pair_check" CHECK (("bug_reports"."entity_type" is null) = ("bug_reports"."entity_id" is null)),
	CONSTRAINT "bug_reports_entity_type_check" CHECK ("bug_reports"."entity_type" is null or "bug_reports"."entity_type" in ('media-item', 'franchise', 'quiz')),
	CONSTRAINT "bug_reports_entity_id_check" CHECK ("bug_reports"."entity_id" is null or btrim("bug_reports"."entity_id") <> ''),
	CONSTRAINT "bug_reports_status_check" CHECK ("bug_reports"."status" in ('new', 'reviewing', 'confirmed', 'fixed', 'rejected')),
	CONSTRAINT "bug_reports_confirmed_at_check" CHECK (("bug_reports"."status" in ('confirmed', 'fixed')) = ("bug_reports"."confirmed_at" is not null)),
	CONSTRAINT "bug_reports_resolution_check" CHECK ((("bug_reports"."status" in ('fixed', 'rejected')) = ("bug_reports"."resolved_at" is not null)) and ("bug_reports"."status" in ('fixed', 'rejected') or "bug_reports"."resolved_by_admin_id" is null))
);
--> statement-breakpoint
CREATE TABLE "collection_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_blocks" integer DEFAULT 300 NOT NULL,
	"max_entries" integer DEFAULT 200 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_settings_singleton_id_check" CHECK ("collection_settings"."id" = 1),
	CONSTRAINT "collection_settings_max_blocks_check" CHECK ("collection_settings"."max_blocks" > 0),
	CONSTRAINT "collection_settings_max_entries_check" CHECK ("collection_settings"."max_entries" > 0)
);
--> statement-breakpoint
CREATE TABLE "contribution_media_items" (
	"contribution_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	CONSTRAINT "contribution_media_items_pk" PRIMARY KEY("contribution_id","media_item_id")
);
--> statement-breakpoint
CREATE TABLE "contribution_reviews" (
	"contribution_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "contribution_type" NOT NULL,
	"author_id" integer NOT NULL,
	"primary_media_item_id" integer NOT NULL,
	"part_id" integer,
	"status" "contribution_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_admin_id" integer,
	"reviewed_at" timestamp with time zone,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_review_part_check" CHECK ("contributions"."part_id" is null or "contributions"."type" = 'review')
);
--> statement-breakpoint
CREATE TABLE "cover_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"candidate_limit" integer DEFAULT 8 NOT NULL,
	"tmdb_result_scan_limit" integer DEFAULT 3 NOT NULL,
	"cover_max_bytes" integer DEFAULT 5242880 NOT NULL,
	"provider_request_timeout_ms" integer DEFAULT 15000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cover_settings_singleton_id_check" CHECK ("cover_settings"."id" = 1),
	CONSTRAINT "cover_settings_candidate_limit_check" CHECK ("cover_settings"."candidate_limit" >= 1),
	CONSTRAINT "cover_settings_tmdb_scan_limit_check" CHECK ("cover_settings"."tmdb_result_scan_limit" >= 1),
	CONSTRAINT "cover_settings_cover_max_bytes_check" CHECK ("cover_settings"."cover_max_bytes" >= 1),
	CONSTRAINT "cover_settings_provider_request_timeout_ms_check" CHECK ("cover_settings"."provider_request_timeout_ms" between 1000 and 120000)
);
--> statement-breakpoint
CREATE TABLE "creator_logo_candidates" (
	"request_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"anilist_studio_id" text NOT NULL,
	"decision" text,
	"resolved_by_admin_id" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_logo_candidates_request_id_creator_id_pk" PRIMARY KEY("request_id","creator_id"),
	CONSTRAINT "creator_logo_candidates_studio_check" CHECK ("creator_logo_candidates"."anilist_studio_id" ~ '^studio:[1-9][0-9]*$'),
	CONSTRAINT "creator_logo_candidates_decision_check" CHECK ("creator_logo_candidates"."decision" is null or "creator_logo_candidates"."decision" in ('map','reject')),
	CONSTRAINT "creator_logo_candidates_resolution_check" CHECK (("creator_logo_candidates"."decision" is null) = ("creator_logo_candidates"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "creator_relations" (
	"source_creator_id" integer NOT NULL,
	"target_creator_id" integer NOT NULL,
	"relation_type" text NOT NULL,
	CONSTRAINT "creator_relations_source_creator_id_target_creator_id_relation_type_pk" PRIMARY KEY("source_creator_id","target_creator_id","relation_type"),
	CONSTRAINT "creator_relations_distinct_check" CHECK ("creator_relations"."source_creator_id" <> "creator_relations"."target_creator_id"),
	CONSTRAINT "creator_relations_type_check" CHECK ("creator_relations"."relation_type" = 'pseudonym_of')
);
--> statement-breakpoint
CREATE TABLE "creator_request_media_items" (
	"role_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"external_creator_name" text NOT NULL,
	"source_position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_request_media_items_request_id_media_item_id_role_id_pk" PRIMARY KEY("request_id","media_item_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "creator_requests" (
	"external_creator_id" text,
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_creator_name" text NOT NULL,
	"normalized_external_creator_name" text NOT NULL,
	"decision" text,
	"resolved_by_admin_id" integer,
	"resolved_at" timestamp with time zone,
	"job_run_id" integer,
	"apply_status" text DEFAULT 'pending' NOT NULL,
	"job_error" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manually_reopened" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_requests_identity_check" CHECK ("creator_requests"."external_creator_id" is null or ((("creator_requests"."provider" in ('fantlab','bgg') and "creator_requests"."external_creator_id" ~ '^[1-9][0-9]*$') or ("creator_requests"."provider" = 'igdb' and "creator_requests"."external_creator_id" ~ '^company:[1-9][0-9]*$') or ("creator_requests"."provider" = 'tmdb' and "creator_requests"."external_creator_id" ~ '^(company|network|person):[1-9][0-9]*$') or ("creator_requests"."provider" = 'anilist' and "creator_requests"."external_creator_id" ~ '^(person|studio):[1-9][0-9]*$') or ("creator_requests"."provider" = 'rawg' and "creator_requests"."external_creator_id" ~ '^(developer|publisher):[1-9][0-9]*$') or ("creator_requests"."provider" in ('comic-vine','mangaupdates') and "creator_requests"."external_creator_id" ~ '^(person|publisher):[1-9][0-9]*$') or ("creator_requests"."provider" = 'roblox' and "creator_requests"."external_creator_id" ~ '^(user|group):[1-9][0-9]*$')))),
	CONSTRAINT "creator_requests_decision_check" CHECK ("creator_requests"."decision" is null or "creator_requests"."decision" in ('create','map','exclude')),
	CONSTRAINT "creator_requests_status_check" CHECK ("creator_requests"."apply_status" in ('pending','applying','processed','failed'))
);
--> statement-breakpoint
CREATE TABLE "creator_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_roles_code_unique" UNIQUE("code"),
	CONSTRAINT "creator_roles_values_check" CHECK (btrim("creator_roles"."name") <> '' and "creator_roles"."code" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "creator_series" (
	"creator_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	CONSTRAINT "creator_series_creator_id_series_id_pk" PRIMARY KEY("creator_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "creator_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_types_code_unique" UNIQUE("code"),
	CONSTRAINT "creator_types_values_check" CHECK (btrim("creator_types"."name") <> '' and "creator_types"."code" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"original_name" text,
	"name_ru" text,
	"name_ru_source" text,
	"name_ru_processed" boolean DEFAULT false NOT NULL,
	"birth_date" date,
	"death_date" date,
	"avatar_object_key" text,
	"avatar_source" text,
	"avatar_source_external_id" text,
	"avatar_source_url" text,
	"avatar_original_url" text,
	"avatar_fetched_at" timestamp with time zone,
	"avatar_content_hash" text,
	"avatar_version" integer DEFAULT 0 NOT NULL,
	"type_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_slug_unique" UNIQUE("slug"),
	CONSTRAINT "creators_name_ru_check" CHECK (("creators"."name_ru" is null or (btrim("creators"."name_ru") <> '' and char_length("creators"."name_ru") <= 200)) and ("creators"."name_ru_source" is null or "creators"."name_ru_source" in ('ai','manual','provider')) and ("creators"."name_ru" is null or "creators"."name_ru_source" is not null)),
	CONSTRAINT "creators_values_check" CHECK (btrim("creators"."name") <> '' and btrim("creators"."slug") <> ''),
	CONSTRAINT "creators_avatar_check" CHECK ((
    ("creators"."avatar_object_key" is null and "creators"."avatar_source" is null and "creators"."avatar_content_hash" is null
      and "creators"."avatar_source_external_id" is null and "creators"."avatar_source_url" is null and "creators"."avatar_original_url" is null and "creators"."avatar_fetched_at" is null)
    or ("creators"."avatar_object_key" is not null and "creators"."avatar_source" is not null and "creators"."avatar_source" in ('manual','fantlab','igdb','rawg','tmdb','anilist','comic-vine','roblox')
      and "creators"."avatar_content_hash" is not null and "creators"."avatar_content_hash" ~ '^[0-9a-f]{64}$'
      and "creators"."avatar_object_key" ~ '^avatars/creators/[1-9][0-9]*/[0-9a-f-]{36}[.]webp$'
      and (("creators"."avatar_source" = 'manual' and "creators"."avatar_source_external_id" is null and "creators"."avatar_source_url" is null and "creators"."avatar_original_url" is null and "creators"."avatar_fetched_at" is null)
        or ("creators"."avatar_source" in ('fantlab','igdb','rawg','tmdb','anilist','comic-vine','roblox') and "creators"."avatar_source_external_id" is not null and (("creators"."avatar_source" = 'fantlab' and "creators"."avatar_source_external_id" ~ '^[1-9][0-9]*$') or ("creators"."avatar_source" = 'anilist' and "creators"."avatar_source_external_id" ~ '^person:[1-9][0-9]*$') or ("creators"."avatar_source" = 'igdb' and "creators"."avatar_source_external_id" ~ '^company:[1-9][0-9]*$') or ("creators"."avatar_source" = 'tmdb' and "creators"."avatar_source_external_id" ~ '^(company|network|person):[1-9][0-9]*$') or ("creators"."avatar_source" = 'rawg' and "creators"."avatar_source_external_id" ~ '^(developer|publisher):[1-9][0-9]*$') or ("creators"."avatar_source" = 'comic-vine' and "creators"."avatar_source_external_id" ~ '^(person|publisher):[1-9][0-9]*$') or ("creators"."avatar_source" = 'roblox' and "creators"."avatar_source_external_id" ~ '^(user|group):[1-9][0-9]*$'))
          and "creators"."avatar_source_url" is not null and "creators"."avatar_original_url" is not null and "creators"."avatar_fetched_at" is not null)))
  ) and "creators"."avatar_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "domain_event_consumptions" (
	"event_id" uuid NOT NULL,
	"consumer_key" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_event_consumptions_event_id_consumer_key_pk" PRIMARY KEY("event_id","consumer_key"),
	CONSTRAINT "domain_event_consumptions_consumer_key_check" CHECK (btrim("domain_event_consumptions"."consumer_key") <> '')
);
--> statement-breakpoint
CREATE TABLE "domain_event_outbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"dispatched_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"actor_author_id" integer,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_type_check" CHECK (btrim("domain_events"."type") <> ''),
	CONSTRAINT "domain_events_schema_version_check" CHECK ("domain_events"."schema_version" >= 1),
	CONSTRAINT "domain_events_aggregate_type_check" CHECK (btrim("domain_events"."aggregate_type") <> ''),
	CONSTRAINT "domain_events_aggregate_id_check" CHECK (btrim("domain_events"."aggregate_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "editorial_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_object_key" text,
	"publication_status" "publication_status" DEFAULT 'private' NOT NULL,
	"created_by_admin_id" integer,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collections_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "editorial_collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "editorial_collections_title_check" CHECK (btrim("editorial_collections"."title") <> ''),
	CONSTRAINT "editorial_collections_slug_check" CHECK (btrim("editorial_collections"."slug") <> ''),
	CONSTRAINT "editorial_collections_description_length_check" CHECK ("editorial_collections"."description" is null or char_length("editorial_collections"."description") <= 10000),
	CONSTRAINT "editorial_collections_publication_status_check" CHECK ("editorial_collections"."publication_status" in ('private', 'published'))
);
--> statement-breakpoint
CREATE TABLE "editorial_document_block_items" (
	"block_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "editorial_document_block_items_block_id_media_item_id_pk" PRIMARY KEY("block_id","media_item_id"),
	CONSTRAINT "editorial_document_block_items_position_unique" UNIQUE("block_id","position"),
	CONSTRAINT "editorial_document_block_items_position_check" CHECK ("editorial_document_block_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "editorial_document_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"position" integer NOT NULL,
	"block_type" "editorial_document_block_type" NOT NULL,
	"media_item_id" integer,
	"title" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_document_blocks_position_unique" UNIQUE("document_id","position"),
	CONSTRAINT "editorial_document_blocks_position_check" CHECK ("editorial_document_blocks"."position" >= 0),
	CONSTRAINT "editorial_document_blocks_shape_check" CHECK ((
        "editorial_document_blocks"."title" is null and (
        ("editorial_document_blocks"."block_type" = 'media' and "editorial_document_blocks"."media_item_id" is not null and ("editorial_document_blocks"."content" is null or char_length("editorial_document_blocks"."content") <= 1000))
        or ("editorial_document_blocks"."block_type" = 'heading' and "editorial_document_blocks"."media_item_id" is null and "editorial_document_blocks"."content" is not null and char_length(btrim("editorial_document_blocks"."content")) between 1 and 200)
        or ("editorial_document_blocks"."block_type" = 'text' and "editorial_document_blocks"."media_item_id" is null and "editorial_document_blocks"."content" is not null and char_length(btrim("editorial_document_blocks"."content")) between 1 and 5000)
        )
      ) or (
        "editorial_document_blocks"."block_type"::text = 'entry_group' and "editorial_document_blocks"."media_item_id" is null
        and ("editorial_document_blocks"."title" is null or char_length("editorial_document_blocks"."title") <= 200)
        and ("editorial_document_blocks"."content" is null or char_length("editorial_document_blocks"."content") <= 5000)
      ))
);
--> statement-breakpoint
CREATE TABLE "editorial_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "editorial_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_automation_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"delivery_batch_size" integer DEFAULT 10 NOT NULL,
	"delivery_max_attempts" integer DEFAULT 5 NOT NULL,
	"retry_base_seconds" integer DEFAULT 120 NOT NULL,
	"retry_max_seconds" integer DEFAULT 3600 NOT NULL,
	"challenge_retention_hours" integer DEFAULT 24 NOT NULL,
	"session_retention_days" integer DEFAULT 7 NOT NULL,
	"stale_registration_days" integer DEFAULT 7 NOT NULL,
	"sent_outbox_retention_days" integer DEFAULT 30 NOT NULL,
	"failed_outbox_retention_days" integer DEFAULT 30 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_automation_settings_singleton_id_check" CHECK ("email_automation_settings"."id" = 1),
	CONSTRAINT "email_automation_delivery_batch_check" CHECK ("email_automation_settings"."delivery_batch_size" between 1 and 50),
	CONSTRAINT "email_automation_delivery_attempts_check" CHECK ("email_automation_settings"."delivery_max_attempts" between 1 and 20),
	CONSTRAINT "email_automation_retry_base_check" CHECK ("email_automation_settings"."retry_base_seconds" between 60 and 86400),
	CONSTRAINT "email_automation_retry_max_check" CHECK ("email_automation_settings"."retry_max_seconds" between "email_automation_settings"."retry_base_seconds" and 604800),
	CONSTRAINT "email_automation_challenge_retention_check" CHECK ("email_automation_settings"."challenge_retention_hours" between 1 and 720),
	CONSTRAINT "email_automation_session_retention_check" CHECK ("email_automation_settings"."session_retention_days" between 1 and 365),
	CONSTRAINT "email_automation_registration_retention_check" CHECK ("email_automation_settings"."stale_registration_days" between 1 and 90),
	CONSTRAINT "email_automation_sent_retention_check" CHECK ("email_automation_settings"."sent_outbox_retention_days" between 1 and 365),
	CONSTRAINT "email_automation_failed_retention_check" CHECK ("email_automation_settings"."failed_outbox_retention_days" between 7 and 730)
);
--> statement-breakpoint
CREATE TABLE "email_delivery_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"api_key_hint" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_delivery_settings_singleton_id_check" CHECK ("email_delivery_settings"."id" = 1),
	CONSTRAINT "email_delivery_settings_provider_check" CHECK ("email_delivery_settings"."provider" = 'resend')
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"lease_token" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_template_check" CHECK ("email_outbox"."template" in ('verify_email', 'reset_password', 'email_changed', 'registration_approved', 'registration_rejected')),
	CONSTRAINT "email_outbox_status_check" CHECK ("email_outbox"."status" in ('pending', 'sending', 'sent', 'failed')),
	CONSTRAINT "email_outbox_attempts_check" CHECK ("email_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entry_creator_pseudonyms" (
	"entry_id" integer PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"role_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_creator_sources" (
	"binding_id" integer,
	"source_position" integer,
	"entry_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"provider" text NOT NULL,
	"normalized_external_creator_name" text NOT NULL,
	CONSTRAINT "entry_creator_sources_entry_id_creator_id_role_id_provider_normalized_external_creator_name_pk" PRIMARY KEY("entry_id","creator_id","role_id","provider","normalized_external_creator_name")
);
--> statement-breakpoint
CREATE TABLE "entry_creators" (
	"entry_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_creators_entry_id_creator_id_role_id_pk" PRIMARY KEY("entry_id","creator_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "franchises" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"created_by_author_id" integer,
	"publication_status" "publication_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchises_code_unique" UNIQUE("code"),
	CONSTRAINT "franchises_parent_not_self_check" CHECK ("franchises"."parent_id" is null or "franchises"."parent_id" <> "franchises"."id")
);
--> statement-breakpoint
CREATE TABLE "game_company_profiles" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"source_url" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_url" text,
	"image_object_key" text,
	"image_content_hash" text,
	"profile_status" text DEFAULT 'pending' NOT NULL,
	"image_status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_company_profiles_provider_external_id_pk" PRIMARY KEY("provider","external_id"),
	CONSTRAINT "game_company_profiles_identity_check" CHECK (("game_company_profiles"."provider" = 'igdb' and "game_company_profiles"."external_id" ~ '^company:[1-9][0-9]*$') or ("game_company_profiles"."provider" = 'tmdb' and "game_company_profiles"."external_id" ~ '^(company|network):[1-9][0-9]*$') or ("game_company_profiles"."provider"='rawg' and "game_company_profiles"."external_id" ~ '^(developer|publisher):[1-9][0-9]*$')),
	CONSTRAINT "game_company_profiles_status_check" CHECK ("game_company_profiles"."profile_status" in ('pending','ready','missing') and "game_company_profiles"."image_status" in ('pending','ready','missing'))
);
--> statement-breakpoint
CREATE TABLE "game_company_rosters" (
	"media_item_id" integer NOT NULL,
	"provider" text NOT NULL,
	"source_external_id" text NOT NULL,
	"references" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_company_rosters_media_item_id_provider_pk" PRIMARY KEY("media_item_id","provider"),
	CONSTRAINT "game_company_rosters_provider_check" CHECK ("game_company_rosters"."provider" in ('igdb','rawg'))
);
--> statement-breakpoint
CREATE TABLE "genre_request_media_items" (
	"request_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"external_genre_name" text NOT NULL,
	"external_genre_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genre_request_media_items_request_id_media_item_id_pk" PRIMARY KEY("request_id","media_item_id"),
	CONSTRAINT "genre_request_media_items_name_check" CHECK (btrim("genre_request_media_items"."external_genre_name") <> ''),
	CONSTRAINT "genre_request_media_items_external_id_check" CHECK ("genre_request_media_items"."external_genre_id" is null or btrim("genre_request_media_items"."external_genre_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "genre_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_genre_name" text NOT NULL,
	"normalized_external_genre_name" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" text,
	"resolved_by_admin_id" integer,
	"resolved_at" timestamp with time zone,
	"job_run_id" integer,
	"apply_status" text DEFAULT 'pending' NOT NULL,
	"job_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genre_requests_provider_check" CHECK (btrim("genre_requests"."provider") <> ''),
	CONSTRAINT "genre_requests_name_check" CHECK (btrim("genre_requests"."external_genre_name") <> '' and btrim("genre_requests"."normalized_external_genre_name") <> ''),
	CONSTRAINT "genre_requests_decision_check" CHECK ("genre_requests"."decision" is null or "genre_requests"."decision" in ('create', 'map', 'exclude')),
	CONSTRAINT "genre_requests_apply_status_check" CHECK ("genre_requests"."apply_status" in ('pending', 'applying', 'processed', 'failed')),
	CONSTRAINT "genre_requests_resolution_check" CHECK (("genre_requests"."decision" is null and "genre_requests"."resolved_at" is null and "genre_requests"."apply_status" in ('pending', 'applying', 'failed')) or ("genre_requests"."decision" is not null and "genre_requests"."resolved_at" is not null and "genre_requests"."apply_status" <> 'pending'))
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"replacement_franchise_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genres_slug_unique" UNIQUE("slug"),
	CONSTRAINT "genres_slug_check" CHECK (btrim("genres"."slug") <> ''),
	CONSTRAINT "genres_name_check" CHECK (btrim("genres"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer,
	"retry_of_run_id" integer,
	"created_by_admin_id" integer,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"retry_base_seconds" integer NOT NULL,
	"retry_max_seconds" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lock_token" text,
	"lock_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_runs_type_check" CHECK (btrim("job_runs"."type") <> ''),
	CONSTRAINT "job_runs_source_check" CHECK ("job_runs"."source" in ('schedule', 'manual', 'event')),
	CONSTRAINT "job_runs_status_check" CHECK ("job_runs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "job_runs_attempts_check" CHECK ("job_runs"."attempts" >= 0 and "job_runs"."attempts" <= "job_runs"."max_attempts"),
	CONSTRAINT "job_runs_max_attempts_check" CHECK ("job_runs"."max_attempts" >= 1),
	CONSTRAINT "job_runs_timeout_seconds_check" CHECK ("job_runs"."timeout_seconds" >= 1),
	CONSTRAINT "job_runs_retry_base_seconds_check" CHECK ("job_runs"."retry_base_seconds" >= 1),
	CONSTRAINT "job_runs_retry_max_seconds_check" CHECK ("job_runs"."retry_max_seconds" >= "job_runs"."retry_base_seconds")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cron_expression" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"retry_base_seconds" integer DEFAULT 60 NOT NULL,
	"retry_max_seconds" integer DEFAULT 3600 NOT NULL,
	"history_retention_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_code_unique" UNIQUE("code"),
	CONSTRAINT "jobs_code_check" CHECK (btrim("jobs"."code") <> ''),
	CONSTRAINT "jobs_type_check" CHECK (btrim("jobs"."type") <> ''),
	CONSTRAINT "jobs_max_attempts_check" CHECK ("jobs"."max_attempts" >= 1),
	CONSTRAINT "jobs_timeout_seconds_check" CHECK ("jobs"."timeout_seconds" >= 1),
	CONSTRAINT "jobs_retry_base_seconds_check" CHECK ("jobs"."retry_base_seconds" >= 1),
	CONSTRAINT "jobs_retry_max_seconds_check" CHECK ("jobs"."retry_max_seconds" >= "jobs"."retry_base_seconds"),
	CONSTRAINT "jobs_history_retention_days_check" CHECK ("jobs"."history_retention_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "level_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"enabled_at" timestamp with time zone,
	"max_locked_level" integer DEFAULT 0 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_settings_singleton_id_check" CHECK ("level_settings"."id" = 1),
	CONSTRAINT "level_settings_status_check" CHECK ("level_settings"."status" in ('disabled', 'initializing', 'enabled')),
	CONSTRAINT "level_settings_max_locked_level_check" CHECK ("level_settings"."max_locked_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "level_thresholds" (
	"level" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"xp_threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_thresholds_xp_threshold_unique" UNIQUE("xp_threshold"),
	CONSTRAINT "level_thresholds_level_check" CHECK ("level_thresholds"."level" >= 1),
	CONSTRAINT "level_thresholds_name_check" CHECK (char_length(btrim("level_thresholds"."name")) between 1 and 80),
	CONSTRAINT "level_thresholds_xp_check" CHECK ("level_thresholds"."xp_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_carrier_media_types" (
	"media_carrier_id" integer NOT NULL,
	"media_type" text NOT NULL,
	CONSTRAINT "media_carrier_media_types_pk" PRIMARY KEY("media_carrier_id","media_type")
);
--> statement-breakpoint
CREATE TABLE "media_carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_carriers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "media_item_editorial_summaries" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"summary" text,
	"status" text NOT NULL,
	"generated_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"model_id" text,
	"source_hash" text,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_editorial_summaries_status_check" CHECK ("media_item_editorial_summaries"."status" in ('ready', 'unusable')),
	CONSTRAINT "media_item_editorial_summaries_ready_check" CHECK ("media_item_editorial_summaries"."status" <> 'ready' or nullif(btrim("media_item_editorial_summaries"."summary"), '') is not null)
);
--> statement-breakpoint
CREATE TABLE "media_item_franchise_removal_requests" (
	"media_item_id" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"requested_by_author_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_franchise_removal_requests_pk" PRIMARY KEY("media_item_id","franchise_id")
);
--> statement-breakpoint
CREATE TABLE "media_item_franchises" (
	"media_item_id" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	"created_by_author_id" integer,
	"publication_status" "publication_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_franchises_pk" PRIMARY KEY("media_item_id","franchise_id")
);
--> statement-breakpoint
CREATE TABLE "media_item_genres" (
	"media_item_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	"provider" text,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_genres_media_item_id_genre_id_pk" PRIMARY KEY("media_item_id","genre_id"),
	CONSTRAINT "media_item_genres_source_check" CHECK ("media_item_genres"."provider" is not null or "media_item_genres"."is_manual"),
	CONSTRAINT "media_item_genres_provider_check" CHECK ("media_item_genres"."provider" is null or btrim("media_item_genres"."provider") <> '')
);
--> statement-breakpoint
CREATE TABLE "media_item_metadata" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_provider" text,
	"source_external_id" text,
	"source_url" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_item_platforms" (
	"media_item_id" integer NOT NULL,
	"platform_id" integer NOT NULL,
	"provider" text,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_platforms_media_item_id_platform_id_pk" PRIMARY KEY("media_item_id","platform_id"),
	CONSTRAINT "media_item_platforms_source_check" CHECK ("media_item_platforms"."provider" is not null or "media_item_platforms"."is_manual"),
	CONSTRAINT "media_item_platforms_provider_check" CHECK ("media_item_platforms"."provider" is null or btrim("media_item_platforms"."provider") <> '')
);
--> statement-breakpoint
CREATE TABLE "media_item_provider_snapshots" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"provider_code" text NOT NULL,
	"external_id" text NOT NULL,
	"media_type" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"release_year" integer,
	"source_url" text,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_provider_snapshots_provider_check" CHECK (btrim("media_item_provider_snapshots"."provider_code") <> ''),
	CONSTRAINT "media_item_provider_snapshots_external_id_check" CHECK (btrim("media_item_provider_snapshots"."external_id") <> ''),
	CONSTRAINT "media_item_provider_snapshots_title_check" CHECK (btrim("media_item_provider_snapshots"."title") <> '')
);
--> statement-breakpoint
CREATE TABLE "media_item_rating_stats" (
	"media_item_id" integer PRIMARY KEY NOT NULL,
	"ratings_count" integer NOT NULL,
	"score_sum" numeric NOT NULL,
	CONSTRAINT "media_item_rating_stats_count_check" CHECK ("media_item_rating_stats"."ratings_count" >= 1),
	CONSTRAINT "media_item_rating_stats_sum_check" CHECK ("media_item_rating_stats"."score_sum" between "media_item_rating_stats"."ratings_count" * 10 and "media_item_rating_stats"."ratings_count" * 100)
);
--> statement-breakpoint
CREATE TABLE "media_item_title_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"media_type" text NOT NULL,
	"media_carrier_id" integer,
	"release_year" integer,
	"cover_url" text,
	"cover_thumb_url" text,
	"cover_thumb_attempted_at" timestamp with time zone,
	"metadata_search_disabled" boolean DEFAULT false NOT NULL,
	"metadata_attempted_at" timestamp with time zone,
	"shikimori_enrichment_attempted_at" timestamp with time zone,
	"metadata_issue_code" text,
	"cover_source_provider" text,
	"cover_source_external_id" text,
	"cover_source_page_url" text,
	"author_creation_request_id" text,
	"created_by_author_id" integer,
	"publication_status" "publication_status" DEFAULT 'published' NOT NULL,
	"moderation_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_admin_id" integer,
	"reviewed_at" timestamp with time zone,
	"admin_note" text,
	CONSTRAINT "media_items_code_unique" UNIQUE("code"),
	CONSTRAINT "media_items_metadata_issue_code_check" CHECK ("media_items"."metadata_issue_code" is null or "media_items"."metadata_issue_code" in ('no-candidates', 'title-mismatch', 'year-mismatch', 'ambiguous-match', 'no-provider-metadata', 'provider-error', 'unsupported-source')),
	CONSTRAINT "media_items_moderation_revision_check" CHECK ("media_items"."moderation_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_publicly_available" boolean DEFAULT false NOT NULL,
	"is_available_to_guests" boolean DEFAULT false NOT NULL,
	"enabled_by_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
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
	CONSTRAINT "notification_transport_outbox_status_check" CHECK ("notification_transport_outbox"."status" in ('pending', 'sending', 'delivered', 'failed')),
	CONSTRAINT "notification_transport_outbox_attempts_check" CHECK ("notification_transport_outbox"."attempts" >= 0),
	CONSTRAINT "notification_transport_outbox_transport_check" CHECK ("notification_transport_outbox"."transport" in ('telegram')),
	CONSTRAINT "notification_transport_outbox_recipient_check" CHECK (btrim("notification_transport_outbox"."recipient") <> '')
);
--> statement-breakpoint
CREATE TABLE "notification_transport_routes" (
	"code" text PRIMARY KEY NOT NULL,
	"transport_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_transport_routes_code_check" CHECK ("notification_transport_routes"."code" in ('submission_created', 'bug_report_created', 'auto_moderation_approved')),
	CONSTRAINT "notification_transport_routes_code_trim_check" CHECK (btrim("notification_transport_routes"."code") <> '')
);
--> statement-breakpoint
CREATE TABLE "notification_transport_settings" (
	"code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_payload" text,
	"key_hint" text,
	"chat_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_transport_settings_code_check" CHECK ("notification_transport_settings"."code" in ('telegram')),
	CONSTRAINT "notification_transport_settings_code_trim_check" CHECK (btrim("notification_transport_settings"."code") <> '')
);
--> statement-breakpoint
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
	CONSTRAINT "notifications_recipient_type_check" CHECK ("notifications"."recipient_type" in ('admin', 'author')),
	CONSTRAINT "notifications_type_check" CHECK (btrim("notifications"."type") <> ''),
	CONSTRAINT "notifications_title_check" CHECK (btrim("notifications"."title") <> ''),
	CONSTRAINT "notifications_body_check" CHECK (btrim("notifications"."body") <> ''),
	CONSTRAINT "notifications_entity_type_check" CHECK (btrim("notifications"."entity_type") <> ''),
	CONSTRAINT "notifications_entity_id_check" CHECK (btrim("notifications"."entity_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "personal_data_consent_settings" (
	"require_consent" boolean DEFAULT false NOT NULL,
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"operator_details" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	CONSTRAINT "personal_data_consent_settings_singleton_check" CHECK ("personal_data_consent_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "personal_data_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "personal_data_consents_version_check" CHECK (btrim("personal_data_consents"."version") <> ''),
	CONSTRAINT "personal_data_consents_revoked_check" CHECK ("personal_data_consents"."revoked_at" is null or "personal_data_consents"."revoked_at" >= "personal_data_consents"."accepted_at")
);
--> statement-breakpoint
CREATE TABLE "platform_provider_profiles" (
	"is_available" boolean DEFAULT true NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"source_url" text,
	"image_id" text,
	"image_url" text,
	"image_key" text,
	"image_object_key" text,
	"image_content_hash" text,
	"profile_fetched_at" timestamp with time zone,
	"image_fetched_at" timestamp with time zone,
	"image_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_provider_profiles_provider_external_id_pk" PRIMARY KEY("provider","external_id"),
	CONSTRAINT "platform_provider_profiles_provider_check" CHECK ("platform_provider_profiles"."provider" in ('igdb','rawg')),
	CONSTRAINT "platform_provider_profiles_id_check" CHECK ("platform_provider_profiles"."external_id" ~ '^[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "platform_request_media_items" (
	"request_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"external_platform_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_request_media_items_request_id_media_item_id_pk" PRIMARY KEY("request_id","media_item_id"),
	CONSTRAINT "platform_request_media_items_name_check" CHECK (btrim("platform_request_media_items"."external_platform_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "platform_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_platform_name" text NOT NULL,
	"normalized_external_platform_name" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" text,
	"resolved_by_admin_id" integer,
	"resolved_at" timestamp with time zone,
	"job_run_id" integer,
	"apply_status" text DEFAULT 'pending' NOT NULL,
	"job_error" text,
	"kind" text DEFAULT 'mapping' NOT NULL,
	"target_platform_id" integer,
	"proposal_key" text,
	"proposal" jsonb,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"auto_approval_blocked" boolean DEFAULT false NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_requests_kind_check" CHECK ("platform_requests"."kind" in ('mapping','logo') and ("platform_requests"."kind"='mapping' or ("platform_requests"."proposal_key" is not null and "platform_requests"."proposal" is not null))),
	CONSTRAINT "platform_requests_game_check" CHECK ("platform_requests"."media_type" = 'game'),
	CONSTRAINT "platform_requests_provider_check" CHECK (btrim("platform_requests"."provider") <> ''),
	CONSTRAINT "platform_requests_name_check" CHECK (btrim("platform_requests"."external_platform_name") <> '' and btrim("platform_requests"."normalized_external_platform_name") <> ''),
	CONSTRAINT "platform_requests_decision_check" CHECK ("platform_requests"."decision" is null or "platform_requests"."decision" in ('create', 'map', 'exclude')),
	CONSTRAINT "platform_requests_apply_status_check" CHECK ("platform_requests"."apply_status" in ('pending', 'applying', 'processed', 'failed')),
	CONSTRAINT "platform_requests_resolution_check" CHECK (("platform_requests"."decision" is null and "platform_requests"."resolved_at" is null and "platform_requests"."apply_status" in ('pending', 'applying', 'failed')) or ("platform_requests"."decision" is not null and "platform_requests"."resolved_at" is not null and "platform_requests"."apply_status" <> 'pending'))
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"logo_mode" text DEFAULT 'exact' NOT NULL,
	"manual_logo_object_key" text,
	"manual_logo_content_hash" text,
	"imported_logo_object_key" text,
	"imported_logo_content_hash" text,
	"imported_logo_provider" text,
	"imported_logo_external_id" text,
	"imported_logo_image_key" text,
	"logo_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "platforms_logo_mode_check" CHECK ("platforms"."logo_mode" in ('exact','combined')),
	CONSTRAINT "platforms_slug_check" CHECK (btrim("platforms"."slug") <> ''),
	CONSTRAINT "platforms_name_check" CHECK (btrim("platforms"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_creator_bindings" (
	"active" boolean DEFAULT true NOT NULL,
	"external_creator_name" text,
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_creator_id" text NOT NULL,
	"creator_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_creator_bindings_owner_unique" UNIQUE("id","creator_id","provider"),
	CONSTRAINT "provider_creator_bindings_values_check" CHECK ((("provider_creator_bindings"."provider" in ('fantlab','bgg') and "provider_creator_bindings"."external_creator_id" ~ '^[1-9][0-9]*$') or ("provider_creator_bindings"."provider" = 'igdb' and "provider_creator_bindings"."external_creator_id" ~ '^company:[1-9][0-9]*$') or ("provider_creator_bindings"."provider" = 'tmdb' and "provider_creator_bindings"."external_creator_id" ~ '^(company|network|person):[1-9][0-9]*$') or ("provider_creator_bindings"."provider" = 'anilist' and "provider_creator_bindings"."external_creator_id" ~ '^(person|studio):[1-9][0-9]*$') or ("provider_creator_bindings"."provider" = 'rawg' and "provider_creator_bindings"."external_creator_id" ~ '^(developer|publisher):[1-9][0-9]*$') or ("provider_creator_bindings"."provider" in ('comic-vine','mangaupdates') and "provider_creator_bindings"."external_creator_id" ~ '^(person|publisher):[1-9][0-9]*$') or ("provider_creator_bindings"."provider" = 'roblox' and "provider_creator_bindings"."external_creator_id" ~ '^(user|group):[1-9][0-9]*$')) and ("provider_creator_bindings"."provider" <> 'bgg' or "provider_creator_bindings"."external_creator_name" is not null))
);
--> statement-breakpoint
CREATE TABLE "provider_creator_exclusions" (
	"external_creator_id" text,
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_creator_name" text NOT NULL,
	"normalized_external_creator_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_creator_exclusions_identity_check" CHECK ("provider_creator_exclusions"."external_creator_id" is null or ((("provider_creator_exclusions"."provider" in ('fantlab','bgg') and "provider_creator_exclusions"."external_creator_id" ~ '^[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" = 'igdb' and "provider_creator_exclusions"."external_creator_id" ~ '^company:[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" = 'tmdb' and "provider_creator_exclusions"."external_creator_id" ~ '^(company|network|person):[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" = 'anilist' and "provider_creator_exclusions"."external_creator_id" ~ '^(person|studio):[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" = 'rawg' and "provider_creator_exclusions"."external_creator_id" ~ '^(developer|publisher):[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" in ('comic-vine','mangaupdates') and "provider_creator_exclusions"."external_creator_id" ~ '^(person|publisher):[1-9][0-9]*$') or ("provider_creator_exclusions"."provider" = 'roblox' and "provider_creator_exclusions"."external_creator_id" ~ '^(user|group):[1-9][0-9]*$'))))
);
--> statement-breakpoint
CREATE TABLE "provider_creator_mappings" (
	"binding_id" integer,
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_creator_name" text NOT NULL,
	"normalized_external_creator_name" text NOT NULL,
	"creator_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"purpose" text DEFAULT 'content' NOT NULL,
	"provider_code" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"key_hint" text NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_pk" PRIMARY KEY("purpose","provider_code"),
	CONSTRAINT "provider_credentials_purpose_check" CHECK ("provider_credentials"."purpose" IN ('content', 'auth'))
);
--> statement-breakpoint
CREATE TABLE "provider_genre_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_genre_name" text NOT NULL,
	"normalized_external_genre_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_genre_exclusions_provider_check" CHECK (btrim("provider_genre_exclusions"."provider") <> ''),
	CONSTRAINT "provider_genre_exclusions_name_check" CHECK (btrim("provider_genre_exclusions"."external_genre_name") <> '' and btrim("provider_genre_exclusions"."normalized_external_genre_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_genre_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_genre_id" text,
	"external_genre_name" text NOT NULL,
	"normalized_external_genre_name" text NOT NULL,
	"genre_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_genre_mappings_provider_check" CHECK (btrim("provider_genre_mappings"."provider") <> ''),
	CONSTRAINT "provider_genre_mappings_name_check" CHECK (btrim("provider_genre_mappings"."external_genre_name") <> ''),
	CONSTRAINT "provider_genre_mappings_normalized_name_check" CHECK (btrim("provider_genre_mappings"."normalized_external_genre_name") <> ''),
	CONSTRAINT "provider_genre_mappings_external_id_check" CHECK ("provider_genre_mappings"."external_genre_id" is null or btrim("provider_genre_mappings"."external_genre_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_image_settings" (
	"provider_code" text PRIMARY KEY NOT NULL,
	"proxy_images_enabled" boolean DEFAULT false NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_image_settings_code_check" CHECK (btrim("provider_image_settings"."provider_code") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_part_snapshot_links" (
	"media_item_id" integer NOT NULL,
	"snapshot_id" integer NOT NULL,
	"part_id" integer,
	CONSTRAINT "provider_part_snapshot_links_media_item_id_snapshot_id_pk" PRIMARY KEY("media_item_id","snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "provider_platform_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_platform_name" text NOT NULL,
	"normalized_external_platform_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_platform_exclusions_game_check" CHECK ("provider_platform_exclusions"."media_type" = 'game'),
	CONSTRAINT "provider_platform_exclusions_provider_check" CHECK (btrim("provider_platform_exclusions"."provider") <> ''),
	CONSTRAINT "provider_platform_exclusions_name_check" CHECK (btrim("provider_platform_exclusions"."external_platform_name") <> '' and btrim("provider_platform_exclusions"."normalized_external_platform_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_platform_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"media_type" text NOT NULL,
	"external_platform_name" text NOT NULL,
	"normalized_external_platform_name" text NOT NULL,
	"platform_id" integer NOT NULL,
	"external_platform_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_platform_mappings_game_check" CHECK ("provider_platform_mappings"."media_type" = 'game'),
	CONSTRAINT "provider_platform_mappings_provider_check" CHECK (btrim("provider_platform_mappings"."provider") <> ''),
	CONSTRAINT "provider_platform_mappings_name_check" CHECK (btrim("provider_platform_mappings"."external_platform_name") <> ''),
	CONSTRAINT "provider_platform_mappings_normalized_name_check" CHECK (btrim("provider_platform_mappings"."normalized_external_platform_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "provider_rate_limits" (
	"provider_code" text NOT NULL,
	"searches_per_day" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_rate_limits_pk" PRIMARY KEY("provider_code"),
	CONSTRAINT "provider_rate_limits_searches_per_day_check" CHECK ("provider_rate_limits"."searches_per_day" >= 1)
);
--> statement-breakpoint
CREATE TABLE "provider_settings" (
	"media_type" text NOT NULL,
	"provider_code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"title_search_mode" text DEFAULT 'parallel' NOT NULL,
	"cover_search_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_settings_pk" PRIMARY KEY("media_type","provider_code"),
	CONSTRAINT "provider_settings_priority_check" CHECK ("provider_settings"."priority" >= 1),
	CONSTRAINT "provider_settings_title_search_mode_check" CHECK ("provider_settings"."title_search_mode" in ('parallel', 'fallback', 'off'))
);
--> statement-breakpoint
CREATE TABLE "provider_snapshot_links" (
	"snapshot_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"purpose" text NOT NULL,
	CONSTRAINT "provider_snapshot_links_snapshot_id_entity_type_entity_id_purpose_pk" PRIMARY KEY("snapshot_id","entity_type","entity_id","purpose"),
	CONSTRAINT "provider_snapshot_links_values_check" CHECK (btrim("provider_snapshot_links"."entity_type") <> '' and btrim("provider_snapshot_links"."entity_id") <> '' and "provider_snapshot_links"."purpose" in ('primary','dependency'))
);
--> statement-breakpoint
CREATE TABLE "provider_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_code" text NOT NULL,
	"resource_type" text NOT NULL,
	"external_id" text NOT NULL,
	"api_method" text NOT NULL,
	"request_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"content_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"request_started_at" timestamp (3) with time zone NOT NULL,
	"fetched_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "provider_snapshots_identity_check" CHECK (btrim("provider_snapshots"."provider_code") <> '' and btrim("provider_snapshots"."resource_type") <> '' and btrim("provider_snapshots"."external_id") <> '' and btrim("provider_snapshots"."api_method") <> ''),
	CONSTRAINT "provider_snapshots_params_check" CHECK (jsonb_typeof("provider_snapshots"."request_params") = 'object')
);
--> statement-breakpoint
CREATE TABLE "quiz_media_types" (
	"quiz_id" integer NOT NULL,
	"media_type" text NOT NULL,
	CONSTRAINT "quiz_media_types_pk" PRIMARY KEY("quiz_id","media_type")
);
--> statement-breakpoint
CREATE TABLE "quiz_participants" (
	"quiz_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts_remaining" integer NOT NULL,
	"outcome" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "quiz_participants_pk" PRIMARY KEY("quiz_id","author_id"),
	CONSTRAINT "quiz_participants_attempts_remaining_check" CHECK ("quiz_participants"."attempts_remaining" >= 0),
	CONSTRAINT "quiz_participants_outcome_check" CHECK ("quiz_participants"."outcome" is null or "quiz_participants"."outcome" in ('correct', 'exhausted')),
	CONSTRAINT "quiz_participants_completion_check" CHECK (("quiz_participants"."outcome" is null and "quiz_participants"."completed_at" is null) or ("quiz_participants"."outcome" is not null and "quiz_participants"."completed_at" is not null)),
	CONSTRAINT "quiz_participants_attempt_state_check" CHECK (("quiz_participants"."outcome" is null and "quiz_participants"."attempts_remaining" > 0) or "quiz_participants"."outcome" = 'correct' or ("quiz_participants"."outcome" = 'exhausted' and "quiz_participants"."attempts_remaining" = 0))
);
--> statement-breakpoint
CREATE TABLE "quiz_question_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_question_templates_name_unique" UNIQUE("name"),
	CONSTRAINT "quiz_question_templates_name_check" CHECK (btrim("quiz_question_templates"."name") <> ''),
	CONSTRAINT "quiz_question_templates_question_check" CHECK (btrim("quiz_question_templates"."question") <> '')
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text,
	"comment" text,
	"image_object_key" text,
	"answer_media_item_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"attempt_limit" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_period_check" CHECK ("quizzes"."starts_at" < "quizzes"."ends_at"),
	CONSTRAINT "quizzes_attempt_limit_check" CHECK ("quizzes"."attempt_limit" between 1 and 10),
	CONSTRAINT "quizzes_comment_length_check" CHECK ("quizzes"."comment" is null or char_length("quizzes"."comment") <= 2000),
	CONSTRAINT "quizzes_content_check" CHECK (nullif(btrim("quizzes"."question"), '') is not null or "quizzes"."image_object_key" is not null)
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"part_id" integer,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_score_whole_1_to_10_check" CHECK ("ratings"."score" >= 10 and "ratings"."score" <= 100 and "ratings"."score" % 10 = 0)
);
--> statement-breakpoint
CREATE TABLE "review_reactions" (
	"review_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reactions_pk" PRIMARY KEY("review_id","type","user_id"),
	CONSTRAINT "review_reactions_type_check" CHECK ("review_reactions"."type" in ('like'))
);
--> statement-breakpoint
CREATE TABLE "title_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"type" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"description" text,
	"year" integer,
	"source_provider" text,
	"external_id" text,
	"air_date" date,
	"episode_count" integer,
	"poster_source_url" text,
	"cover_url" text,
	"cover_thumb_url" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_parts_media_type_number_unique" UNIQUE("media_item_id","type","number"),
	CONSTRAINT "title_parts_media_id_unique" UNIQUE("media_item_id","id"),
	CONSTRAINT "title_parts_type_check" CHECK ("title_parts"."type" in ('season', 'issue', 'volume', 'part')),
	CONSTRAINT "title_parts_number_check" CHECK ("title_parts"."number" >= 0),
	CONSTRAINT "title_parts_episode_count_check" CHECK ("title_parts"."episode_count" >= 0),
	CONSTRAINT "title_parts_source_check" CHECK (("title_parts"."source_provider" is null and "title_parts"."external_id" is null) or
    (nullif(btrim("title_parts"."source_provider"), '') is not null and nullif(btrim("title_parts"."external_id"), '') is not null))
);
--> statement-breakpoint
CREATE TABLE "toast_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"site_duration_seconds" integer DEFAULT 5 NOT NULL,
	"admin_duration_seconds" integer DEFAULT 5 NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toast_settings_singleton_id_check" CHECK ("toast_settings"."id" = 1),
	CONSTRAINT "toast_settings_site_duration_check" CHECK ("toast_settings"."site_duration_seconds" between 1 and 60),
	CONSTRAINT "toast_settings_admin_duration_check" CHECK ("toast_settings"."admin_duration_seconds" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "trust_action_rules" (
	"action_code" text PRIMARY KEY NOT NULL,
	"trust_points" integer NOT NULL,
	"counts_toward_trust" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_action_rules_code_check" CHECK (btrim("trust_action_rules"."action_code") <> ''),
	CONSTRAINT "trust_action_rules_known_code_check" CHECK ("trust_action_rules"."action_code" in ('rating.created', 'media.published', 'series.link-existing.published', 'series.created-with-link.published', 'series.link-removal.published', 'review.published', 'bug-report.confirmed')),
	CONSTRAINT "trust_action_rules_points_check" CHECK ("trust_action_rules"."trust_points" >= 1),
	CONSTRAINT "trust_action_rules_display_order_check" CHECK ("trust_action_rules"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trust_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"minimum_level" integer DEFAULT 5 NOT NULL,
	"minimum_trust_points" integer DEFAULT 5 NOT NULL,
	"minimum_approval_rate_percent" integer DEFAULT 90 NOT NULL,
	"minimum_history_days" integer DEFAULT 14 NOT NULL,
	"auto_promotion_enabled" boolean DEFAULT true NOT NULL,
	"updated_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_settings_singleton_id_check" CHECK ("trust_settings"."id" = 1),
	CONSTRAINT "trust_settings_minimum_level_check" CHECK ("trust_settings"."minimum_level" >= 1),
	CONSTRAINT "trust_settings_minimum_trust_points_check" CHECK ("trust_settings"."minimum_trust_points" >= 1),
	CONSTRAINT "trust_settings_minimum_approval_rate_check" CHECK ("trust_settings"."minimum_approval_rate_percent" between 0 and 100),
	CONSTRAINT "trust_settings_minimum_history_days_check" CHECK ("trust_settings"."minimum_history_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"achievement_level_id" integer NOT NULL,
	"source_event_id" uuid,
	"award_group_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"announced_at" timestamp with time zone,
	CONSTRAINT "user_achievements_author_achievement_level_unique" UNIQUE("author_id","achievement_level_id")
);
--> statement-breakpoint
CREATE TABLE "xp_action_rules" (
	"action_code" text PRIMARY KEY NOT NULL,
	"xp" integer NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_action_rules_code_check" CHECK (btrim("xp_action_rules"."action_code") <> ''),
	CONSTRAINT "xp_action_rules_known_code_check" CHECK ("xp_action_rules"."action_code" in ('rating.created', 'media.published', 'series.link-existing.published', 'series.created-with-link.published', 'series.link-removal.published', 'review.published', 'bug-report.confirmed')),
	CONSTRAINT "xp_action_rules_xp_check" CHECK ("xp_action_rules"."xp" >= 0),
	CONSTRAINT "xp_action_rules_display_order_check" CHECK ("xp_action_rules"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "achievement_levels" ADD CONSTRAINT "achievement_levels_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_settings" ADD CONSTRAINT "achievement_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_activity_logs" ADD CONSTRAINT "admin_activity_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_activity_logs" ADD CONSTRAINT "admin_activity_logs_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_exports" ADD CONSTRAINT "admin_exports_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_scenario_profile_id_ai_scenario_profiles_id_fk" FOREIGN KEY ("scenario_profile_id") REFERENCES "public"."ai_scenario_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scenario_profiles" ADD CONSTRAINT "ai_scenario_profiles_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_settings" ADD CONSTRAINT "archive_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD CONSTRAINT "auth_provider_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_access_profile_media_types" ADD CONSTRAINT "author_access_profile_media_types_access_profile_id_author_access_profiles_id_fk" FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_access_profile_media_types" ADD CONSTRAINT "author_access_profile_media_types_media_type_id_media_types_id_fk" FOREIGN KEY ("media_type_id") REFERENCES "public"."media_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_access_tokens" ADD CONSTRAINT "author_access_tokens_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_access_tokens" ADD CONSTRAINT "author_access_tokens_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_approved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_rejected_by_admin_id_admin_users_id_fk" FOREIGN KEY ("rejected_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_action_ledger" ADD CONSTRAINT "author_action_ledger_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_archive_exploration_settings" ADD CONSTRAINT "author_archive_exploration_settings_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_challenges" ADD CONSTRAINT "author_auth_challenges_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_challenges" ADD CONSTRAINT "author_auth_challenges_email_id_author_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."author_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_identities" ADD CONSTRAINT "author_auth_identities_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_emails" ADD CONSTRAINT "author_emails_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_first_author_id_authors_id_fk" FOREIGN KEY ("first_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_second_author_id_authors_id_fk" FOREIGN KEY ("second_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_friendships" ADD CONSTRAINT "author_friendships_requested_by_author_id_authors_id_fk" FOREIGN KEY ("requested_by_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_experiences" ADD CONSTRAINT "author_media_experiences_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_experiences" ADD CONSTRAINT "author_media_experiences_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_statuses" ADD CONSTRAINT "author_media_statuses_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_statuses" ADD CONSTRAINT "author_media_statuses_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_type_settings" ADD CONSTRAINT "author_media_type_settings_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_media_type_settings" ADD CONSTRAINT "author_media_type_settings_media_type_id_media_types_id_fk" FOREIGN KEY ("media_type_id") REFERENCES "public"."media_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_progress" ADD CONSTRAINT "author_progress_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_registration_settings" ADD CONSTRAINT "author_registration_settings_access_profile_id_author_access_profiles_id_fk" FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_registration_settings" ADD CONSTRAINT "author_registration_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_sessions" ADD CONSTRAINT "author_sessions_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_sessions" ADD CONSTRAINT "author_sessions_identity_id_author_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."author_auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_trust" ADD CONSTRAINT "author_trust_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_name_source_identity_id_author_auth_identities_id_fk" FOREIGN KEY ("name_source_identity_id") REFERENCES "public"."author_auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_source_identity_id_author_auth_identities_id_fk" FOREIGN KEY ("avatar_source_identity_id") REFERENCES "public"."author_auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_access_profile_id_author_access_profiles_id_fk" FOREIGN KEY ("access_profile_id") REFERENCES "public"."author_access_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_blocked_by_admin_id_admin_users_id_fk" FOREIGN KEY ("blocked_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automoderation_checks" ADD CONSTRAINT "automoderation_checks_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_settings" ADD CONSTRAINT "collection_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_media_items" ADD CONSTRAINT "contribution_media_items_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_media_items" ADD CONSTRAINT "contribution_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_primary_media_item_id_media_items_id_fk" FOREIGN KEY ("primary_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_part_media_fk" FOREIGN KEY ("primary_media_item_id","part_id") REFERENCES "public"."title_parts"("media_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_logo_candidates" ADD CONSTRAINT "creator_logo_candidates_request_id_creator_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."creator_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_logo_candidates" ADD CONSTRAINT "creator_logo_candidates_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_logo_candidates" ADD CONSTRAINT "creator_logo_candidates_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_relations" ADD CONSTRAINT "creator_relations_source_creator_id_creators_id_fk" FOREIGN KEY ("source_creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_relations" ADD CONSTRAINT "creator_relations_target_creator_id_creators_id_fk" FOREIGN KEY ("target_creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_request_media_items" ADD CONSTRAINT "creator_request_media_items_role_id_creator_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."creator_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_request_media_items" ADD CONSTRAINT "creator_request_media_items_request_id_creator_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."creator_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_request_media_items" ADD CONSTRAINT "creator_request_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_requests" ADD CONSTRAINT "creator_requests_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_requests" ADD CONSTRAINT "creator_requests_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_requests" ADD CONSTRAINT "creator_requests_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_series" ADD CONSTRAINT "creator_series_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_series" ADD CONSTRAINT "creator_series_series_id_franchises_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_type_id_creator_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."creator_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event_consumptions" ADD CONSTRAINT "domain_event_consumptions_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD CONSTRAINT "domain_event_outbox_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_actor_author_id_authors_id_fk" FOREIGN KEY ("actor_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_document_id_editorial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."editorial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collections" ADD CONSTRAINT "editorial_collections_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_document_block_items" ADD CONSTRAINT "editorial_document_block_items_block_id_editorial_document_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."editorial_document_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_document_block_items" ADD CONSTRAINT "editorial_document_block_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_document_blocks" ADD CONSTRAINT "editorial_document_blocks_document_id_editorial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."editorial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_document_blocks" ADD CONSTRAINT "editorial_document_blocks_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automation_settings" ADD CONSTRAINT "email_automation_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_entry_id_media_items_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_pseudonyms" ADD CONSTRAINT "entry_creator_pseudonyms_role_id_creator_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."creator_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_sources" ADD CONSTRAINT "entry_creator_sources_entry_id_creator_id_role_id_entry_creators_entry_id_creator_id_role_id_fk" FOREIGN KEY ("entry_id","creator_id","role_id") REFERENCES "public"."entry_creators"("entry_id","creator_id","role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creator_sources" ADD CONSTRAINT "entry_creator_sources_binding_owner_fk" FOREIGN KEY ("binding_id","creator_id","provider") REFERENCES "public"."provider_creator_bindings"("id","creator_id","provider") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creators" ADD CONSTRAINT "entry_creators_entry_id_media_items_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creators" ADD CONSTRAINT "entry_creators_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_creators" ADD CONSTRAINT "entry_creators_role_id_creator_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."creator_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_parent_id_franchises_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."franchises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchises" ADD CONSTRAINT "franchises_created_by_author_id_authors_id_fk" FOREIGN KEY ("created_by_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_company_rosters" ADD CONSTRAINT "game_company_rosters_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_request_media_items" ADD CONSTRAINT "genre_request_media_items_request_id_genre_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."genre_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_request_media_items" ADD CONSTRAINT "genre_request_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_requests" ADD CONSTRAINT "genre_requests_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_requests" ADD CONSTRAINT "genre_requests_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_requests" ADD CONSTRAINT "genre_requests_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_replacement_franchise_id_franchises_id_fk" FOREIGN KEY ("replacement_franchise_id") REFERENCES "public"."franchises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_retry_of_run_id_job_runs_id_fk" FOREIGN KEY ("retry_of_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_settings" ADD CONSTRAINT "level_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_carrier_media_types" ADD CONSTRAINT "media_carrier_media_types_media_carrier_id_media_carriers_id_fk" FOREIGN KEY ("media_carrier_id") REFERENCES "public"."media_carriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_carrier_media_types" ADD CONSTRAINT "media_carrier_media_types_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_editorial_summaries" ADD CONSTRAINT "media_item_editorial_summaries_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_franchise_removal_requests" ADD CONSTRAINT "media_item_franchise_removal_requests_requested_by_author_id_authors_id_fk" FOREIGN KEY ("requested_by_author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_franchise_removal_requests" ADD CONSTRAINT "media_item_franchise_removal_requests_link_fk" FOREIGN KEY ("media_item_id","franchise_id") REFERENCES "public"."media_item_franchises"("media_item_id","franchise_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_franchises" ADD CONSTRAINT "media_item_franchises_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_franchises" ADD CONSTRAINT "media_item_franchises_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_franchises" ADD CONSTRAINT "media_item_franchises_created_by_author_id_authors_id_fk" FOREIGN KEY ("created_by_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_metadata" ADD CONSTRAINT "media_item_metadata_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_platforms" ADD CONSTRAINT "media_item_platforms_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_platforms" ADD CONSTRAINT "media_item_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_provider_snapshots" ADD CONSTRAINT "media_item_provider_snapshots_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_provider_snapshots" ADD CONSTRAINT "media_item_provider_snapshots_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_rating_stats" ADD CONSTRAINT "media_item_rating_stats_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_title_aliases" ADD CONSTRAINT "media_item_title_aliases_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_media_carrier_id_media_carriers_id_fk" FOREIGN KEY ("media_carrier_id") REFERENCES "public"."media_carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_created_by_author_id_authors_id_fk" FOREIGN KEY ("created_by_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_transport_outbox" ADD CONSTRAINT "notification_transport_outbox_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_transport_routes" ADD CONSTRAINT "notification_transport_routes_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_transport_settings" ADD CONSTRAINT "notification_transport_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_data_consents" ADD CONSTRAINT "personal_data_consents_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_request_media_items" ADD CONSTRAINT "platform_request_media_items_request_id_platform_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."platform_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_request_media_items" ADD CONSTRAINT "platform_request_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_target_platform_id_platforms_id_fk" FOREIGN KEY ("target_platform_id") REFERENCES "public"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_creator_bindings" ADD CONSTRAINT "provider_creator_bindings_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_creator_exclusions" ADD CONSTRAINT "provider_creator_exclusions_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_creator_mappings" ADD CONSTRAINT "provider_creator_mappings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_creator_mappings" ADD CONSTRAINT "provider_creator_mappings_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_creator_mappings" ADD CONSTRAINT "provider_creator_mappings_binding_owner_fk" FOREIGN KEY ("binding_id","creator_id","provider") REFERENCES "public"."provider_creator_bindings"("id","creator_id","provider") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_genre_exclusions" ADD CONSTRAINT "provider_genre_exclusions_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_genre_mappings" ADD CONSTRAINT "provider_genre_mappings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_genre_mappings" ADD CONSTRAINT "provider_genre_mappings_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_image_settings" ADD CONSTRAINT "provider_image_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_part_snapshot_links" ADD CONSTRAINT "provider_part_snapshot_links_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_part_snapshot_links" ADD CONSTRAINT "provider_part_snapshot_links_snapshot_id_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."provider_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_part_snapshot_links" ADD CONSTRAINT "provider_part_snapshot_links_part_id_title_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."title_parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_part_snapshot_links" ADD CONSTRAINT "provider_part_snapshot_links_part_media_fk" FOREIGN KEY ("media_item_id","part_id") REFERENCES "public"."title_parts"("media_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_exclusions" ADD CONSTRAINT "provider_platform_exclusions_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_mappings" ADD CONSTRAINT "provider_platform_mappings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_mappings" ADD CONSTRAINT "provider_platform_mappings_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_mappings" ADD CONSTRAINT "platform_mapping_external_fk" FOREIGN KEY ("provider","external_platform_id") REFERENCES "public"."platform_provider_profiles"("provider","external_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD CONSTRAINT "provider_settings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_snapshot_links" ADD CONSTRAINT "provider_snapshot_links_snapshot_id_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."provider_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_media_types" ADD CONSTRAINT "quiz_media_types_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_media_types" ADD CONSTRAINT "quiz_media_types_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_answer_media_item_id_media_items_id_fk" FOREIGN KEY ("answer_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_part_media_fk" FOREIGN KEY ("media_item_id","part_id") REFERENCES "public"."title_parts"("media_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reactions" ADD CONSTRAINT "review_reactions_review_id_contribution_reviews_contribution_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."contribution_reviews"("contribution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reactions" ADD CONSTRAINT "review_reactions_user_id_authors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_parts" ADD CONSTRAINT "title_parts_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast_settings" ADD CONSTRAINT "toast_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_settings" ADD CONSTRAINT "trust_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_level_id_achievement_levels_id_fk" FOREIGN KEY ("achievement_level_id") REFERENCES "public"."achievement_levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_source_event_id_domain_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."domain_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_levels_achievement_id_idx" ON "achievement_levels" USING btree ("achievement_id");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_created_at_idx" ON "admin_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_actor_admin_idx" ON "admin_activity_logs" USING btree ("actor_type","admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_actor_author_idx" ON "admin_activity_logs" USING btree ("actor_type","author_id");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_entity_idx" ON "admin_activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_action_idx" ON "admin_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_activity_logs_severity_idx" ON "admin_activity_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "admin_exports_created_at_idx" ON "admin_exports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_exports_owner_created_idx" ON "admin_exports" USING btree ("created_by_admin_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_exports_status_expires_idx" ON "admin_exports" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "ai_call_logs_created_at_idx" ON "ai_call_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_call_logs_profile_created_at_idx" ON "ai_call_logs" USING btree ("profile_key","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_logs_status_created_at_idx" ON "ai_call_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_scenario_profiles_key_unique" ON "ai_scenario_profiles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "author_access_tokens_author_id_idx" ON "author_access_tokens" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_action_ledger_author_occurred_idx" ON "author_action_ledger" USING btree ("author_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "author_action_ledger_source_idx" ON "author_action_ledger" USING btree ("source_type","source_key");--> statement-breakpoint
CREATE INDEX "author_action_ledger_source_event_idx" ON "author_action_ledger" USING btree ("source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "author_action_ledger_reward_unique" ON "author_action_ledger" USING btree ("reward_key") WHERE "author_action_ledger"."entry_kind" = 'reward';--> statement-breakpoint
CREATE INDEX "author_auth_challenges_author_id_idx" ON "author_auth_challenges" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_purpose_idx" ON "author_auth_challenges" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_token_hash_idx" ON "author_auth_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_expires_at_idx" ON "author_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "author_auth_identities_author_id_idx" ON "author_auth_identities" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_emails_author_id_idx" ON "author_emails" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "author_emails_primary_author_idx" ON "author_emails" USING btree ("author_id") WHERE "author_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "author_friendships_first_status_idx" ON "author_friendships" USING btree ("first_author_id","status");--> statement-breakpoint
CREATE INDEX "author_friendships_second_status_idx" ON "author_friendships" USING btree ("second_author_id","status");--> statement-breakpoint
CREATE INDEX "author_friendships_requester_status_idx" ON "author_friendships" USING btree ("requested_by_author_id","status");--> statement-breakpoint
CREATE INDEX "author_media_experiences_author_id_idx" ON "author_media_experiences" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_media_statuses_author_status_idx" ON "author_media_statuses" USING btree ("author_id","status");--> statement-breakpoint
CREATE INDEX "author_media_statuses_media_item_id_idx" ON "author_media_statuses" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "author_progress_level_author_idx" ON "author_progress" USING btree ("current_level","author_id");--> statement-breakpoint
CREATE INDEX "author_sessions_author_id_idx" ON "author_sessions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_sessions_identity_id_idx" ON "author_sessions" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "author_sessions_expires_at_idx" ON "author_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "author_trust_points_author_idx" ON "author_trust" USING btree ("trust_points","author_id");--> statement-breakpoint
CREATE INDEX "authors_access_profile_id_idx" ON "authors" USING btree ("access_profile_id");--> statement-breakpoint
CREATE INDEX "authors_name_source_identity_id_idx" ON "authors" USING btree ("name_source_identity_id");--> statement-breakpoint
CREATE INDEX "authors_avatar_source_identity_id_idx" ON "authors" USING btree ("avatar_source_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "authors_avatar_object_key_unique" ON "authors" USING btree ("avatar_object_key") WHERE "authors"."avatar_object_key" is not null;--> statement-breakpoint
CREATE INDEX "authors_name_search_idx" ON "authors" USING gin (replace(lower(regexp_replace(btrim(coalesce("name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "automoderation_checks_source_event_unique" ON "automoderation_checks" USING btree ("source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automoderation_checks_subject_revision_unique" ON "automoderation_checks" USING btree ("subject_type","subject_key","subject_revision");--> statement-breakpoint
CREATE INDEX "automoderation_checks_pending_idx" ON "automoderation_checks" USING btree ("status","created_at") WHERE "automoderation_checks"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "bug_reports_status_created_at_idx" ON "bug_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "bug_reports_author_id_idx" ON "bug_reports" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bug_reports_author_confirmed_at_idx" ON "bug_reports" USING btree ("author_id","confirmed_at") WHERE "bug_reports"."confirmed_at" is not null;--> statement-breakpoint
CREATE INDEX "contribution_media_items_media_item_id_idx" ON "contribution_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "contributions_status_submitted_at_idx" ON "contributions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "contributions_author_id_updated_at_idx" ON "contributions" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "contributions_primary_media_item_id_idx" ON "contributions" USING btree ("primary_media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_review_overall_unique" ON "contributions" USING btree ("author_id","primary_media_item_id") WHERE "contributions"."type" = 'review' and "contributions"."part_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_review_part_unique" ON "contributions" USING btree ("author_id","primary_media_item_id","part_id") WHERE "contributions"."type" = 'review' and "contributions"."part_id" is not null;--> statement-breakpoint
CREATE INDEX "contributions_media_part_idx" ON "contributions" USING btree ("primary_media_item_id","part_id");--> statement-breakpoint
CREATE INDEX "creator_logo_candidates_creator_idx" ON "creator_logo_candidates" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_logo_candidates_admin_idx" ON "creator_logo_candidates" USING btree ("resolved_by_admin_id");--> statement-breakpoint
CREATE INDEX "creator_relations_target_idx" ON "creator_relations" USING btree ("target_creator_id");--> statement-breakpoint
CREATE INDEX "creator_request_media_items_entry_idx" ON "creator_request_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_requests_key_unique" ON "creator_requests" USING btree ("provider","media_type","normalized_external_creator_name") WHERE "creator_requests"."external_creator_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_requests_identity_unique" ON "creator_requests" USING btree ("provider","external_creator_id") WHERE "creator_requests"."external_creator_id" is not null;--> statement-breakpoint
CREATE INDEX "creator_requests_auto_approval_idx" ON "creator_requests" USING btree ("id") WHERE "creator_requests"."decision" is null and "creator_requests"."manually_reopened" = false and "creator_requests"."apply_status"='pending';--> statement-breakpoint
CREATE INDEX "creator_requests_pending_idx" ON "creator_requests" USING btree ("first_seen_at","id") WHERE "creator_requests"."decision" is null;--> statement-breakpoint
CREATE INDEX "creator_requests_seen_idx" ON "creator_requests" USING btree ("first_seen_at","id");--> statement-breakpoint
CREATE INDEX "creator_requests_job_idx" ON "creator_requests" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "creator_series_series_idx" ON "creator_series" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "creators_display_name_order_idx" ON "creators" USING btree (coalesce("name_ru", "name"),"id");--> statement-breakpoint
CREATE INDEX "creators_name_ru_search_idx" ON "creators" USING gin (replace(lower(regexp_replace(btrim(coalesce("name_ru", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "creators_name_ru_pending_idx" ON "creators" USING btree ("type_id","id") WHERE "creators"."name_ru_processed" = false and ("creators"."name_ru_source" is null or "creators"."name_ru_source" = 'ai');--> statement-breakpoint
CREATE INDEX "creators_name_search_idx" ON "creators" USING gin (replace(lower(regexp_replace(btrim(coalesce("name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "creators_original_name_search_idx" ON "creators" USING gin (replace(lower(regexp_replace(btrim(coalesce("original_name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "creators_name_exact_idx" ON "creators" USING btree (btrim(replace(lower(regexp_replace(btrim(coalesce("name", '')), '\s+', ' ', 'g')), 'ё', 'е')));--> statement-breakpoint
CREATE INDEX "creators_original_name_exact_idx" ON "creators" USING btree (btrim(replace(lower(regexp_replace(btrim(coalesce("original_name", '')), '\s+', ' ', 'g')), 'ё', 'е')));--> statement-breakpoint
CREATE INDEX "creators_type_id_idx" ON "creators" USING btree ("type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_avatar_object_key_unique" ON "creators" USING btree ("avatar_object_key") WHERE "creators"."avatar_object_key" is not null;--> statement-breakpoint
CREATE INDEX "domain_event_outbox_pending_idx" ON "domain_event_outbox" USING btree ("next_attempt_at","event_id") WHERE "domain_event_outbox"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "domain_events_type_occurred_at_idx" ON "domain_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_author_registration_idx" ON "domain_events" USING btree ("aggregate_id") WHERE "domain_events"."type" = 'author.registration.submitted' and "domain_events"."aggregate_type" = 'author';--> statement-breakpoint
CREATE INDEX "domain_events_actor_occurred_at_idx" ON "domain_events" USING btree ("actor_author_id","occurred_at");--> statement-breakpoint
CREATE INDEX "editorial_collections_publication_updated_idx" ON "editorial_collections" USING btree ("publication_status","updated_at");--> statement-breakpoint
CREATE INDEX "editorial_document_block_items_media_item_id_idx" ON "editorial_document_block_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "editorial_document_blocks_document_position_idx" ON "editorial_document_blocks" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "editorial_document_blocks_media_item_id_idx" ON "editorial_document_blocks" USING btree ("media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_document_blocks_document_media_unique" ON "editorial_document_blocks" USING btree ("document_id","media_item_id") WHERE "editorial_document_blocks"."block_type" = 'media';--> statement-breakpoint
CREATE INDEX "email_outbox_delivery_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_sending_lease_idx" ON "email_outbox" USING btree ("updated_at","id") WHERE "email_outbox"."status" = 'sending';--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_id_idx" ON "email_outbox" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "email_outbox_created_id_idx" ON "email_outbox" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "entry_creator_pseudonyms_creator_idx" ON "entry_creator_pseudonyms" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "entry_creator_pseudonyms_role_idx" ON "entry_creator_pseudonyms" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "entry_creator_sources_binding_idx" ON "entry_creator_sources" USING btree ("binding_id");--> statement-breakpoint
CREATE INDEX "entry_creators_creator_role_idx" ON "entry_creators" USING btree ("creator_id","role_id","entry_id");--> statement-breakpoint
CREATE INDEX "entry_creators_role_idx" ON "entry_creators" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "franchises_parent_id_idx" ON "franchises" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "franchises_created_by_author_id_idx" ON "franchises" USING btree ("created_by_author_id");--> statement-breakpoint
CREATE INDEX "franchises_publication_status_idx" ON "franchises" USING btree ("publication_status");--> statement-breakpoint
CREATE INDEX "franchises_title_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "franchises_original_title_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("original_title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "franchises_code_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "game_company_rosters_references_idx" ON "game_company_rosters" USING gin ("references");--> statement-breakpoint
CREATE INDEX "game_company_rosters_provider_entry_idx" ON "game_company_rosters" USING btree ("provider","media_item_id");--> statement-breakpoint
CREATE INDEX "genre_request_media_items_item_idx" ON "genre_request_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "genre_requests_key_unique_idx" ON "genre_requests" USING btree ("provider","media_type","normalized_external_genre_name");--> statement-breakpoint
CREATE INDEX "genre_requests_pending_idx" ON "genre_requests" USING btree ("first_seen_at","id") WHERE "genre_requests"."decision" is null;--> statement-breakpoint
CREATE INDEX "genre_requests_job_run_id_idx" ON "genre_requests" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "genres_replacement_franchise_id_idx" ON "genres" USING btree ("replacement_franchise_id");--> statement-breakpoint
CREATE INDEX "job_runs_current_idx" ON "job_runs" USING btree ("status" desc,"created_at","id") WHERE "job_runs"."status" in ('queued','running');--> statement-breakpoint
CREATE INDEX "job_runs_journal_active_idx" ON "job_runs" USING btree ((case when "status" in ('queued','running') then 0 else 1 end),"created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "job_runs_platform_catalogue_idx" ON "job_runs" USING btree ("id") WHERE "job_runs"."type"='media.platform-logos-sync' and "job_runs"."payload"->'checkpoint'->>'stage'='complete';--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_platform_logos_active_idx" ON "job_runs" USING btree ("type") WHERE "job_runs"."type" = 'media.platform-logos-sync' and "job_runs"."status" in ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_creator_name_localization_active_unique" ON "job_runs" USING btree ("type") WHERE "job_runs"."type" = 'media.creator-name-localization' and "job_runs"."status" in ('queued','running');--> statement-breakpoint
CREATE INDEX "job_runs_queue_idx" ON "job_runs" USING btree ("available_at","id") WHERE "job_runs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "job_runs_recovery_idx" ON "job_runs" USING btree ("lock_expires_at") WHERE "job_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "job_runs_job_created_idx" ON "job_runs" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_finished_idx" ON "job_runs" USING btree ("job_id","finished_at");--> statement-breakpoint
CREATE INDEX "job_runs_type_created_idx" ON "job_runs" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_scheduled_job_occurrence_unique" ON "job_runs" USING btree ("job_id","scheduled_for") WHERE "job_runs"."source" = 'schedule';--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_editorial_summary_active_unique" ON "job_runs" USING btree (("payload"->>'mediaItemId')) WHERE "job_runs"."type" = 'media.editorial-summary-generate' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_automoderation_active_unique" ON "job_runs" USING btree (("payload"->>'checkId')) WHERE "job_runs"."type" = 'moderation.auto-check' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_reputation_initialize_active_unique" ON "job_runs" USING btree ("type") WHERE "job_runs"."type" = 'reputation.initialize' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_anime_shikimori_backfill_active_unique" ON "job_runs" USING btree ("type") WHERE "job_runs"."type" = 'media.anime-shikimori-backfill' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_genre_request_apply_active_unique" ON "job_runs" USING btree (("payload"->>'requestId')) WHERE "job_runs"."type" = 'media.genre-request-apply' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_platform_request_apply_active_unique" ON "job_runs" USING btree (("payload"->>'requestId')) WHERE "job_runs"."type" = 'media.platform-request-apply' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_creator_image_fill_active_unique" ON "job_runs" USING btree (("payload"->>'creatorId'),("payload"->>'bindingFingerprint')) WHERE "job_runs"."type" = 'media.creator-image-fill' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_creator_request_apply_active_unique" ON "job_runs" USING btree (("payload"->>'requestId')) WHERE "job_runs"."type" = 'media.creator-request-apply' and "job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "jobs_scheduler_idx" ON "jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "media_carrier_media_types_media_type_idx" ON "media_carrier_media_types" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "media_carriers_name_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_carriers_description_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("description", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_carriers_code_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_item_franchise_removal_requests_author_id_idx" ON "media_item_franchise_removal_requests" USING btree ("requested_by_author_id");--> statement-breakpoint
CREATE INDEX "media_item_franchises_franchise_media_item_idx" ON "media_item_franchises" USING btree ("franchise_id","media_item_id");--> statement-breakpoint
CREATE INDEX "media_item_franchises_publication_status_idx" ON "media_item_franchises" USING btree ("publication_status");--> statement-breakpoint
CREATE INDEX "media_item_franchises_created_by_author_idx" ON "media_item_franchises" USING btree ("created_by_author_id");--> statement-breakpoint
CREATE INDEX "media_item_genres_genre_id_idx" ON "media_item_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "media_item_metadata_source_entry_idx" ON "media_item_metadata" USING btree ("source_provider","media_item_id");--> statement-breakpoint
CREATE INDEX "media_item_metadata_comic_vine_issues_pending_idx" ON "media_item_metadata" USING btree (coalesce("facts"->>'comicVineIssueLastAttemptAt', ''),"media_item_id") WHERE "media_item_metadata"."source_provider" = 'comic-vine' and not ("media_item_metadata"."facts" @> '{"comicVineIssuesComplete":true}'::jsonb);--> statement-breakpoint
CREATE INDEX "media_item_metadata_anilist_creators_pending_idx" ON "media_item_metadata" USING btree ("media_item_id") WHERE "media_item_metadata"."source_provider" in ('anilist','jikan') and "media_item_metadata"."source_external_id" ~ '^[1-9][0-9]*$' and not ("media_item_metadata"."facts" @> '{"anilistCreatorsComplete":true}'::jsonb or "media_item_metadata"."facts" @> '{"anilistCreatorsUnavailable":true}'::jsonb);--> statement-breakpoint
CREATE INDEX "media_item_platforms_platform_id_idx" ON "media_item_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "media_item_provider_snapshots_provider_external_idx" ON "media_item_provider_snapshots" USING btree ("provider_code","external_id");--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_ratings_count_idx" ON "media_item_rating_stats" USING btree ("ratings_count");--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_average_score_idx" ON "media_item_rating_stats" USING btree ((("score_sum")::double precision / "ratings_count"));--> statement-breakpoint
CREATE INDEX "media_item_rating_stats_quality_media_item_idx" ON "media_item_rating_stats" USING btree ("media_item_id") WHERE "media_item_rating_stats"."score_sum" >= "media_item_rating_stats"."ratings_count" * 70;--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_title_aliases_media_item_value_lower_unique_idx" ON "media_item_title_aliases" USING btree ("media_item_id",lower("value"));--> statement-breakpoint
CREATE INDEX "media_item_title_aliases_media_item_id_idx" ON "media_item_title_aliases" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "media_item_title_aliases_value_search_idx" ON "media_item_title_aliases" USING gin (replace(lower(regexp_replace(btrim(coalesce("value", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_items_shikimori_pending_idx" ON "media_items" USING btree ("media_type","id") WHERE "media_items"."shikimori_enrichment_attempted_at" is null;--> statement-breakpoint
CREATE INDEX "media_items_publication_status_idx" ON "media_items" USING btree ("publication_status");--> statement-breakpoint
CREATE INDEX "media_items_media_type_idx" ON "media_items" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "media_items_release_year_idx" ON "media_items" USING btree ("release_year");--> statement-breakpoint
CREATE INDEX "media_items_title_idx" ON "media_items" USING btree ("title");--> statement-breakpoint
CREATE INDEX "media_items_title_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_items_original_title_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("original_title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_items_code_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_items_created_by_author_id_idx" ON "media_items" USING btree ("created_by_author_id");--> statement-breakpoint
CREATE INDEX "media_items_cover_thumb_attempted_at_idx" ON "media_items" USING btree ("cover_thumb_attempted_at");--> statement-breakpoint
CREATE INDEX "media_items_metadata_attempted_at_idx" ON "media_items" USING btree ("metadata_attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_author_creation_request_id_unique_idx" ON "media_items" USING btree ("created_by_author_id","author_creation_request_id");--> statement-breakpoint
CREATE INDEX "media_items_media_carrier_id_idx" ON "media_items" USING btree ("media_carrier_id");--> statement-breakpoint
CREATE INDEX "notification_transport_outbox_delivery_idx" ON "notification_transport_outbox" USING btree ("status","next_attempt_at") WHERE "notification_transport_outbox"."status" in ('pending', 'sending');--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_type","recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_type","recipient_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_consents_active_unique" ON "personal_data_consents" USING btree ("author_id","version") WHERE "personal_data_consents"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "personal_data_consents_author_idx" ON "personal_data_consents" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "platform_provider_profiles_asset_idx" ON "platform_provider_profiles" USING btree ("provider","image_key") WHERE "platform_provider_profiles"."image_object_key" is not null and "platform_provider_profiles"."image_content_hash" is not null;--> statement-breakpoint
CREATE INDEX "platform_provider_profiles_image_idx" ON "platform_provider_profiles" USING btree ("image_object_key") WHERE "platform_provider_profiles"."image_object_key" is not null;--> statement-breakpoint
CREATE INDEX "platform_provider_profiles_name_idx" ON "platform_provider_profiles" USING btree ("provider","normalized_name");--> statement-breakpoint
CREATE INDEX "platform_request_media_items_item_idx" ON "platform_request_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_requests_key_unique_idx" ON "platform_requests" USING btree ("provider","media_type","normalized_external_platform_name") WHERE "platform_requests"."kind" = 'mapping';--> statement-breakpoint
CREATE UNIQUE INDEX "platform_requests_proposal_unique_idx" ON "platform_requests" USING btree ("kind","proposal_key") WHERE "platform_requests"."kind" <> 'mapping';--> statement-breakpoint
CREATE INDEX "platform_requests_target_idx" ON "platform_requests" USING btree ("target_platform_id","kind","id");--> statement-breakpoint
CREATE INDEX "platform_requests_logo_evidence_idx" ON "platform_requests" USING btree ("target_platform_id",("proposal"->>'provider'),("proposal"->>'externalId'),("proposal"->>'imageKey')) WHERE "platform_requests"."kind"='logo' and "platform_requests"."decision"='map' and "platform_requests"."apply_status"='processed';--> statement-breakpoint
CREATE INDEX "platform_requests_pending_idx" ON "platform_requests" USING btree ("first_seen_at","id") WHERE "platform_requests"."decision" is null and not "platform_requests"."superseded";--> statement-breakpoint
CREATE INDEX "platform_requests_job_run_id_idx" ON "platform_requests" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "platforms_manual_logo_idx" ON "platforms" USING btree ("manual_logo_object_key") WHERE "platforms"."manual_logo_object_key" is not null;--> statement-breakpoint
CREATE INDEX "platforms_imported_logo_idx" ON "platforms" USING btree ("imported_logo_object_key") WHERE "platforms"."imported_logo_object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_creator_bindings_identity_unique" ON "provider_creator_bindings" USING btree ("provider","external_creator_id") WHERE "provider_creator_bindings"."active";--> statement-breakpoint
CREATE INDEX "provider_creator_bindings_creator_idx" ON "provider_creator_bindings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "provider_creator_bindings_history_idx" ON "provider_creator_bindings" USING btree ("provider","external_creator_id");--> statement-breakpoint
CREATE INDEX "provider_creator_bindings_active_creator_idx" ON "provider_creator_bindings" USING btree ("provider","creator_id") WHERE "provider_creator_bindings"."active";--> statement-breakpoint
CREATE INDEX "provider_creator_bindings_name_search_idx" ON "provider_creator_bindings" USING gin (replace(lower(regexp_replace(btrim(coalesce("external_creator_name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops) WHERE "provider_creator_bindings"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "provider_creator_exclusions_key_unique" ON "provider_creator_exclusions" USING btree ("provider","media_type","normalized_external_creator_name") WHERE "provider_creator_exclusions"."external_creator_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_creator_exclusions_identity_unique" ON "provider_creator_exclusions" USING btree ("provider","external_creator_id") WHERE "provider_creator_exclusions"."external_creator_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_creator_mappings_key_unique" ON "provider_creator_mappings" USING btree ("provider","media_type","normalized_external_creator_name");--> statement-breakpoint
CREATE INDEX "provider_creator_mappings_creator_idx" ON "provider_creator_mappings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "provider_creator_mappings_binding_idx" ON "provider_creator_mappings" USING btree ("binding_id");--> statement-breakpoint
CREATE INDEX "provider_creator_mappings_name_creator_idx" ON "provider_creator_mappings" USING btree ("normalized_external_creator_name","creator_id");--> statement-breakpoint
CREATE INDEX "provider_creator_mappings_name_search_idx" ON "provider_creator_mappings" USING gin (replace(lower(regexp_replace(btrim(coalesce("external_creator_name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_exclusions_key_unique_idx" ON "provider_genre_exclusions" USING btree ("provider","media_type","normalized_external_genre_name");--> statement-breakpoint
CREATE INDEX "provider_genre_mappings_genre_id_idx" ON "provider_genre_mappings" USING btree ("genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_mappings_name_unique_idx" ON "provider_genre_mappings" USING btree ("provider","media_type","normalized_external_genre_name","genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_mappings_id_unique_idx" ON "provider_genre_mappings" USING btree ("provider","media_type","external_genre_id","genre_id") WHERE "provider_genre_mappings"."external_genre_id" is not null;--> statement-breakpoint
CREATE INDEX "provider_part_snapshot_links_snapshot_idx" ON "provider_part_snapshot_links" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "provider_part_snapshot_links_part_idx" ON "provider_part_snapshot_links" USING btree ("media_item_id","part_id");--> statement-breakpoint
CREATE INDEX "provider_part_snapshot_links_part_id_idx" ON "provider_part_snapshot_links" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_platform_exclusions_key_unique_idx" ON "provider_platform_exclusions" USING btree ("provider","media_type","normalized_external_platform_name");--> statement-breakpoint
CREATE INDEX "platform_mappings_external_idx" ON "provider_platform_mappings" USING btree ("provider","external_platform_id","platform_id");--> statement-breakpoint
CREATE INDEX "provider_platform_mappings_platform_id_idx" ON "provider_platform_mappings" USING btree ("platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_platform_mappings_name_unique_idx" ON "provider_platform_mappings" USING btree ("provider","media_type","normalized_external_platform_name","platform_id");--> statement-breakpoint
CREATE INDEX "provider_snapshot_links_entity_idx" ON "provider_snapshot_links" USING btree ("entity_type","entity_id","purpose","snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_snapshots_identity_unique" ON "provider_snapshots" USING btree ("provider_code","resource_type","external_id","api_method","request_key");--> statement-breakpoint
CREATE INDEX "provider_snapshots_anilist_mal_idx" ON "provider_snapshots" USING btree (("payload"->>'idMal')) WHERE "provider_snapshots"."provider_code"='anilist' and "provider_snapshots"."resource_type"='anime' and "provider_snapshots"."api_method"='anime.creators';--> statement-breakpoint
CREATE INDEX "quiz_media_types_media_type_idx" ON "quiz_media_types" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "quiz_participants_author_id_idx" ON "quiz_participants" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "quizzes_answer_media_item_id_idx" ON "quizzes" USING btree ("answer_media_item_id");--> statement-breakpoint
CREATE INDEX "quizzes_active_idx" ON "quizzes" USING btree ("enabled","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "ratings_author_id_idx" ON "ratings" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_overall_unique" ON "ratings" USING btree ("media_item_id","author_id") WHERE "ratings"."part_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_part_unique" ON "ratings" USING btree ("media_item_id","author_id","part_id") WHERE "ratings"."part_id" is not null;--> statement-breakpoint
CREATE INDEX "ratings_media_part_idx" ON "ratings" USING btree ("media_item_id","part_id");--> statement-breakpoint
CREATE INDEX "review_reactions_user_id_idx" ON "review_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "title_parts_provider_external_unique" ON "title_parts" USING btree ("media_item_id","source_provider","external_id") WHERE "title_parts"."source_provider" is not null and "title_parts"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "title_parts_media_sort_idx" ON "title_parts" USING btree ("media_item_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "user_achievements_author_awarded_at_idx" ON "user_achievements" USING btree ("author_id","awarded_at");--> statement-breakpoint
CREATE INDEX "user_achievements_pending_announcement_idx" ON "user_achievements" USING btree ("author_id","award_group_id","awarded_at") WHERE "user_achievements"."announced_at" is null;
--> statement-breakpoint
-- Retained application SQL functions.
--> statement-breakpoint
CREATE FUNCTION public.enforce_editorial_document_block_limits() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_document_id integer;
  block_count bigint;
  entry_count bigint;
  max_blocks integer;
  max_entries integer;
BEGIN
  IF TG_TABLE_NAME = 'editorial_document_block_items' THEN
    SELECT document_id INTO target_document_id FROM editorial_document_blocks WHERE id = NEW.block_id;
  ELSE
    target_document_id := NEW.document_id;
  END IF;
  IF target_document_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(6431, target_document_id);
  SELECT s.max_blocks, s.max_entries INTO max_blocks, max_entries FROM collection_settings s WHERE id = 1;
  SELECT count(*), count(*) FILTER (WHERE block_type = 'media')
    INTO block_count, entry_count FROM editorial_document_blocks WHERE document_id = target_document_id;
  SELECT entry_count + count(*) INTO entry_count
    FROM editorial_document_block_items i JOIN editorial_document_blocks b ON b.id = i.block_id
    WHERE b.document_id = target_document_id AND b.block_type::text = 'entry_group';
  IF block_count > coalesce(max_blocks, 300) THEN
    RAISE EXCEPTION 'blocks-limit:%', coalesce(max_blocks, 300);
  END IF;
  IF entry_count > coalesce(max_entries, 200) THEN
    RAISE EXCEPTION 'media-blocks-limit:%', coalesce(max_entries, 200);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.lock_media_item_rating_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.media_item_id <> NEW.media_item_id THEN
   PERFORM pg_advisory_xact_lock(73001, least(OLD.media_item_id, NEW.media_item_id));
   PERFORM pg_advisory_xact_lock(73001, greatest(OLD.media_item_id, NEW.media_item_id));
 ELSIF TG_OP = 'DELETE' THEN
   PERFORM pg_advisory_xact_lock(73001, OLD.media_item_id);
 ELSE
   PERFORM pg_advisory_xact_lock(73001, NEW.media_item_id);
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.preserve_genre_request_job_result() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF OLD.type <> 'media.genre-request-apply' THEN RETURN OLD; END IF;
 UPDATE genre_requests SET
  apply_status = CASE WHEN OLD.status = 'succeeded' THEN CASE WHEN decision IS NULL THEN 'pending' ELSE 'processed' END ELSE 'failed' END,
  job_error = CASE WHEN OLD.status = 'succeeded' THEN NULL ELSE coalesce(left(OLD.error_message, 1000), job_error, 'Задача была отменена или удалена до завершения.') END,
  updated_at = now()
 WHERE job_run_id = OLD.id;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.preserve_platform_request_job_result() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF OLD.type <> 'media.platform-request-apply' THEN RETURN OLD; END IF;
 UPDATE platform_requests SET
  apply_status = CASE WHEN OLD.status = 'succeeded' THEN CASE WHEN decision IS NULL THEN 'pending' ELSE 'processed' END ELSE 'failed' END,
  job_error = CASE WHEN OLD.status = 'succeeded' THEN NULL ELSE coalesce(left(OLD.error_message, 1000), job_error, 'Задача была отменена или удалена до завершения.') END,
  updated_at = now()
 WHERE job_run_id = OLD.id;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.protect_creator_reference_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'Creator reference code is immutable'; END IF; RETURN NEW; END $$;
--> statement-breakpoint
CREATE FUNCTION public.refresh_media_item_rating_stats(item_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
 INSERT INTO media_item_rating_stats(media_item_id,ratings_count,score_sum)
 SELECT item_id, count(*)::integer, sum(effective_score)
 FROM (
   SELECT author_id,
     coalesce(max(score) FILTER (WHERE part_id IS NULL), avg(score) FILTER (WHERE part_id IS NOT NULL)) AS effective_score
   FROM ratings WHERE media_item_id = item_id AND NOT EXISTS (SELECT 1 FROM title_parts p WHERE p.id = ratings.part_id AND p.type = 'season' AND p.number = 0) GROUP BY author_id
 ) effective
 HAVING count(*) > 0
 ON CONFLICT(media_item_id) DO UPDATE SET ratings_count = EXCLUDED.ratings_count, score_sum = EXCLUDED.score_sum;
 DELETE FROM media_item_rating_stats WHERE media_item_id = item_id
   AND NOT EXISTS(SELECT 1 FROM ratings WHERE media_item_id = item_id AND NOT EXISTS (SELECT 1 FROM title_parts p WHERE p.id = ratings.part_id AND p.type = 'season' AND p.number = 0));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.reject_specials_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM title_parts WHERE id = NEW.part_id AND type = 'season' AND number = 0) THEN
   RAISE EXCEPTION 'Specials cannot be rated' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.sync_media_item_rating_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   PERFORM refresh_media_item_rating_stats(OLD.media_item_id);
   RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' AND OLD.media_item_id <> NEW.media_item_id THEN
   PERFORM refresh_media_item_rating_stats(OLD.media_item_id);
 END IF;
 PERFORM refresh_media_item_rating_stats(NEW.media_item_id);
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER creator_roles_immutable_code BEFORE UPDATE OF code ON public.creator_roles FOR EACH ROW EXECUTE FUNCTION public.protect_creator_reference_code();
--> statement-breakpoint
CREATE TRIGGER creator_types_immutable_code BEFORE UPDATE OF code ON public.creator_types FOR EACH ROW EXECUTE FUNCTION public.protect_creator_reference_code();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER editorial_document_block_items_limits_trigger AFTER INSERT OR UPDATE OF block_id ON public.editorial_document_block_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_editorial_document_block_limits();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER editorial_document_blocks_limits_trigger AFTER INSERT OR UPDATE OF document_id, block_type ON public.editorial_document_blocks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_editorial_document_block_limits();
--> statement-breakpoint
CREATE TRIGGER preserve_genre_request_job_result_before_delete BEFORE DELETE ON public.job_runs FOR EACH ROW EXECUTE FUNCTION public.preserve_genre_request_job_result();
--> statement-breakpoint
CREATE TRIGGER preserve_platform_request_job_result_before_delete BEFORE DELETE ON public.job_runs FOR EACH ROW EXECUTE FUNCTION public.preserve_platform_request_job_result();
--> statement-breakpoint
CREATE TRIGGER ratings_lock_media_item_rating_stats BEFORE INSERT OR DELETE OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.lock_media_item_rating_stats();
--> statement-breakpoint
CREATE TRIGGER ratings_reject_specials BEFORE INSERT OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.reject_specials_rating();
--> statement-breakpoint
CREATE TRIGGER ratings_sync_media_item_rating_stats AFTER INSERT OR DELETE OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.sync_media_item_rating_stats();
--> statement-breakpoint
-- Safe bootstrap defaults; no user archive data.
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (1, 'first-rating', 'Первая оценка', 'Поставить первую оценку опубликованной записи.', true, 10, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', true, 'rating.authored.count', '{}');
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (2, 'ratings-10', '10 оценок', 'Оценить 10 опубликованных записей.', true, 20, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', true, 'rating.authored.count', '{}');
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (3, 'games-rated-10', '10 игр', 'Оценить 10 опубликованных игр.', true, 30, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', true, 'rating.authored.count', '{"mediaType": "game"}');
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (4, 'films-rated-10', '10 фильмов', 'Оценить 10 опубликованных фильмов.', true, 40, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', true, 'rating.authored.count', '{"mediaType": "film"}');
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (5, 'first-published-review', 'Первая опубликованная рецензия', 'Опубликовать первую рецензию.', true, 50, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', true, 'review.authored.count', '{}');
--> statement-breakpoint
INSERT INTO public.achievements (id, code, name, description, enabled, display_order, created_at, updated_at, show_when_locked, mechanic, params) VALUES (6, 'series-rated-10', '10 сериалов', 'Оценить 10 опубликованных сериалов.', true, 45, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', true, 'rating.authored.count', '{"mediaType": "series"}');
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (1, 1, 1, 1, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (2, 2, 1, 10, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (3, 3, 1, 10, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (4, 4, 1, 10, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (5, 5, 1, 1, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_levels (id, achievement_id, level, threshold, name, description, image_object_key, created_at, updated_at, rarity, showcase_background_image_object_key) VALUES (6, 6, 1, 10, NULL, NULL, NULL, '2026-11-04 16:49:55.739861+00', '2026-11-04 16:49:55.739861+00', 'common', NULL);
--> statement-breakpoint
INSERT INTO public.achievement_settings (id, locked_image_object_key, updated_by_admin_id, created_at, updated_at, default_showcase_background_image_object_key) VALUES (1, NULL, NULL, '2026-11-04 16:49:55.769871+00', '2026-11-04 16:49:55.769871+00', NULL);
--> statement-breakpoint
INSERT INTO public.author_access_profiles (id, code, name, is_system, can_publish_media_without_review, max_draft_media_items, max_upload_bytes, max_files_per_media_item, created_at, updated_at, max_draft_media_items_per_day, cover_searches_per_minute, cover_searches_per_hour, cover_searches_per_day, can_publish_franchises_without_review) VALUES (1, 'system', 'Системный', true, true, NULL, NULL, NULL, '2026-11-04 16:49:55.275842+00', '2026-11-04 16:49:55.275842+00', NULL, 20, 200, 1000, true);
--> statement-breakpoint
INSERT INTO public.author_access_profiles (id, code, name, is_system, can_publish_media_without_review, max_draft_media_items, max_upload_bytes, max_files_per_media_item, created_at, updated_at, max_draft_media_items_per_day, cover_searches_per_minute, cover_searches_per_hour, cover_searches_per_day, can_publish_franchises_without_review) VALUES (2, 'regular', 'Обычный автор', false, false, NULL, NULL, NULL, '2026-11-04 16:49:55.275842+00', '2026-11-04 16:49:55.275842+00', NULL, 20, 200, 1000, false);
--> statement-breakpoint
INSERT INTO public.author_access_profiles (id, code, name, is_system, can_publish_media_without_review, max_draft_media_items, max_upload_bytes, max_files_per_media_item, created_at, updated_at, max_draft_media_items_per_day, cover_searches_per_minute, cover_searches_per_hour, cover_searches_per_day, can_publish_franchises_without_review) VALUES (3, 'trusted', 'Доверенный автор', false, true, NULL, NULL, NULL, '2026-11-04 16:49:55.275842+00', '2026-11-04 16:49:55.275842+00', NULL, 20, 200, 1000, true);
--> statement-breakpoint
INSERT INTO public.author_registration_settings (id, access_profile_id, updated_by_admin_id, created_at, updated_at) VALUES (1, NULL, NULL, '2026-11-04 16:49:55.535917+00', '2026-11-04 16:49:55.535917+00');
--> statement-breakpoint
INSERT INTO public.collection_settings (id, max_blocks, max_entries, updated_by_admin_id, created_at, updated_at) VALUES (1, 300, 200, NULL, '2026-11-04 16:49:56.297548+00', '2026-11-04 16:49:56.297548+00');
--> statement-breakpoint
INSERT INTO public.cover_settings (id, candidate_limit, tmdb_result_scan_limit, cover_max_bytes, created_at, updated_at, provider_request_timeout_ms) VALUES (1, 8, 3, 5242880, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.417015+00', 15000);
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (1, 'Писатель', 'writer', '2026-11-04 16:49:56.544869+00', '2026-11-04 16:49:56.544869+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (2, 'Дизайнер', 'designer', '2026-11-04 16:49:56.671582+00', '2026-11-04 16:49:56.671582+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (3, 'Художник', 'artist', '2026-11-04 16:49:56.671582+00', '2026-11-04 16:49:56.671582+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (4, 'Разработчик', 'developer', '2026-11-04 16:49:56.683533+00', '2026-11-04 16:49:56.683533+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (5, 'Издатель', 'publisher', '2026-11-04 16:49:56.683533+00', '2026-11-04 16:49:56.683533+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (6, 'Производственная компания', 'production_company', '2026-11-04 16:49:56.753443+00', '2026-11-04 16:49:56.753443+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (7, 'Режиссёр', 'director', '2026-11-04 16:49:56.759263+00', '2026-11-04 16:49:56.759263+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (8, 'Вещатель', 'network', '2026-11-04 16:49:56.78869+00', '2026-11-04 16:49:56.78869+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (9, 'Создатель', 'creator', '2026-11-04 16:49:56.78869+00', '2026-11-04 16:49:56.78869+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (10, 'Шоураннер', 'showrunner', '2026-11-04 16:49:56.78869+00', '2026-11-04 16:49:56.78869+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (11, 'Продюсер', 'producer', '2026-11-04 16:49:56.793171+00', '2026-11-04 16:49:56.793171+00');
--> statement-breakpoint
INSERT INTO public.creator_roles (id, name, code, created_at, updated_at) VALUES (12, 'Сценарист', 'screenwriter', '2026-11-04 16:49:56.915915+00', '2026-11-04 16:49:56.915915+00');
--> statement-breakpoint
INSERT INTO public.creator_types (id, name, code, created_at, updated_at) VALUES (1, 'Человек', 'person', '2026-11-04 16:49:56.544869+00', '2026-11-04 16:49:56.544869+00');
--> statement-breakpoint
INSERT INTO public.creator_types (id, name, code, created_at, updated_at) VALUES (2, 'Коллектив', 'collective', '2026-11-04 16:49:56.671582+00', '2026-11-04 16:49:56.671582+00');
--> statement-breakpoint
INSERT INTO public.creator_types (id, name, code, created_at, updated_at) VALUES (3, 'Организация', 'organization', '2026-11-04 16:49:56.683533+00', '2026-11-04 16:49:56.683533+00');
--> statement-breakpoint
INSERT INTO public.email_automation_settings (id, delivery_batch_size, delivery_max_attempts, retry_base_seconds, retry_max_seconds, challenge_retention_hours, session_retention_days, stale_registration_days, sent_outbox_retention_days, failed_outbox_retention_days, updated_by_admin_id, created_at, updated_at) VALUES (1, 10, 5, 120, 3600, 24, 7, 7, 30, 30, NULL, '2026-11-04 16:49:55.540524+00', '2026-11-04 16:49:55.540524+00');
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (1, 'action', 'Боевик', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (2, 'comedy', 'Комедия', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (3, 'adventure', 'Приключения', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (4, 'drama', 'Драма', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (5, 'thriller', 'Триллер', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (6, 'sci-fi', 'Фантастика', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (7, 'horror', 'Ужасы', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (8, 'fantasy', 'Фэнтези', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (9, 'family', 'Семейный', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (10, 'crime', 'Криминал', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (11, 'melodrama', 'Мелодрама', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (12, 'animation', 'Мультфильм', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (13, 'detective', 'Детектив', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (14, 'historical', 'Исторический', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (15, 'war', 'Военный', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (16, 'western', 'Вестерн', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (17, 'music', 'Музыка', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (18, 'documentary', 'Документальный', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (19, 'children', 'Детский', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (20, 'politics', 'Политика', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (21, 'soap-opera', 'Мыльная опера', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (22, 'romance', 'Романтика', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (23, 'supernatural', 'Сверхъестественное', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (24, 'psychological', 'Психологический', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (25, 'slice-of-life', 'Повседневность', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (26, 'mecha', 'Меха', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (27, 'ecchi', 'Этти', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (28, 'hentai', 'Хентай', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (29, 'sports', 'Спорт', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (30, 'game-adventure', 'Adventure', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (31, 'game-action', 'Action', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (32, 'game-hack-and-slash', 'Hack and slash/Beat ''em up', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (33, 'game-card-board', 'Card & Board Game', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (34, 'game-card', 'Card', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (35, 'game-indie', 'Инди', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (36, 'game-shooter', 'Шутер', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (37, 'game-puzzle', 'Головоломка', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (38, 'game-rpg', 'RPG', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (39, 'game-platform', 'Платформер', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (40, 'game-strategy', 'Стратегия', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (41, 'game-simulator', 'Симулятор', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (42, 'game-arcade', 'Аркада', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (43, 'game-point-and-click', 'Point-and-click', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (44, 'game-rts', 'RTS', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (45, 'game-racing', 'Гонки', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (46, 'game-tactical', 'Тактика', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (47, 'game-tbs', 'Пошаговая стратегия', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (48, 'game-fighting', 'Файтинг', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (49, 'game-sport', 'Спортивная игра', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (50, 'game-music', 'Музыкальная игра', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (51, 'game-visual-novel', 'Визуальная новелла', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (52, 'game-moba', 'MOBA', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.genres (id, slug, name, is_active, created_at, updated_at, replacement_franchise_id) VALUES (53, 'game-casual', 'Казуальная игра', true, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00', NULL);
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (1, 'auth-email-outbox-delivery', 'auth.email-outbox-delivery', '{}', '* * * * *', '2026-11-04 16:49:55.638697+00', false, 3, 300, 60, 3600, '2026-11-04 16:49:55.638697+00', '2026-11-04 16:49:55.638697+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (2, 'auth-cleanup', 'auth.cleanup', '{}', '0 3 * * *', '2026-11-04 16:49:55.638697+00', false, 3, 300, 60, 3600, '2026-11-04 16:49:55.638697+00', '2026-11-04 16:49:55.638697+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (3, 'jobs-history-cleanup', 'jobs.cleanup-history', '{}', '30 3 * * *', '2026-11-04 16:49:55.682319+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.682319+00', '2026-11-04 16:49:55.682319+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (4, 'cover-thumbnails-backfill', 'media.cover-thumbnails-backfill', '{"limit": 50}', '30 3 * * *', '2026-11-04 16:49:55.695438+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.695438+00', '2026-11-04 16:49:55.695438+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (5, 'domain-events-recovery', 'domain-events.dispatch', '{}', '* * * * *', '2026-11-04 16:49:55.698516+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.698516+00', '2026-11-04 16:49:55.698516+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (6, 'media-metadata-backfill', 'media.metadata-backfill', '{"limit": 25, "quotaReserve": 100}', '0 4 * * *', '2026-11-04 16:49:55.767926+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.767926+00', '2026-11-04 16:49:55.767926+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (7, 'media-metadata-refresh', 'media.metadata-refresh', '{"limit": 20, "staleDays": 90, "quotaReserve": 100}', '0 5 * * 0', '2026-11-04 16:49:55.767926+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.767926+00', '2026-11-04 16:49:55.767926+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (8, 'media-item-rating-stats-reconciliation', 'media.rating-stats-reconcile', '{"batchSize": 500}', '0 1 * * *', '2026-11-04 16:49:55.798764+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.798764+00', '2026-11-04 16:49:55.798764+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (9, 'notification-transport-delivery', 'notifications.transport-delivery', '{}', '* * * * *', '2026-11-04 16:49:55.873461+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.873461+00', '2026-11-04 16:49:55.873461+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (10, 'media-editorial-summaries', 'media.editorial-summary-sweep', '{}', '0 * * * *', '2026-11-04 17:49:55.879461+00', false, 3, 300, 60, 3600, '2026-11-04 16:49:55.879461+00', '2026-11-04 16:49:55.879461+00', 30, '{"prompt": "Напиши короткую редакционную справку о произведении для архивной карточки. Объясни, что это за произведение и чем оно выделяется, опираясь только на предоставленные сведения."}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (11, 'admin-export-cleanup', 'admin.export-cleanup', '{}', '15 3 * * *', '2026-11-04 16:49:55.900209+00', true, 3, 300, 60, 3600, '2026-11-04 16:49:55.900209+00', '2026-11-04 16:49:55.900209+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (12, 'anime-shikimori-backfill', 'media.anime-shikimori-backfill', '{}', '* * * * *', '2026-11-04 16:49:55.93163+00', true, 1, 60, 60, 3600, '2026-11-04 16:49:55.93163+00', '2026-11-04 16:49:55.93163+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (13, 'reputation-trusted-promotion', 'reputation.promote-trusted', '{}', '17 * * * *', '2026-11-04 16:49:55.978958+00', true, 3, 120, 60, 3600, '2026-11-04 16:49:55.978958+00', '2026-11-04 16:49:55.978958+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.jobs (id, code, type, payload, cron_expression, next_run_at, enabled, max_attempts, timeout_seconds, retry_base_seconds, retry_max_seconds, created_at, updated_at, history_retention_days, options) VALUES (14, 'creator-name-localization', 'media.creator-name-localization', '{"batchSize": 20, "requestsPerDay": 200, "requestsPerMinute": 5}', '* * * * *', '2026-11-04 16:49:56.782212+00', false, 5, 300, 60, 3600, '2026-11-04 16:49:56.782212+00', '2026-11-04 16:49:56.782212+00', 30, '{}');
--> statement-breakpoint
INSERT INTO public.level_settings (id, status, enabled_at, max_locked_level, updated_by_admin_id, created_at, updated_at) VALUES (1, 'disabled', NULL, 0, NULL, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (1, 0, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Новичок с мануалом');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (2, 20, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Искатель пасхалок');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (3, 60, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Укротитель бэклога');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (4, 120, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Хранитель канона');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (5, 220, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Повелитель спойлеров');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (6, 350, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Архивариус мультивселенной');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (7, 550, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Босс секретного уровня');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (8, 800, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Легенда локального кооператива');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (9, 1150, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Финальный коллекционер');
--> statement-breakpoint
INSERT INTO public.level_thresholds (level, xp_threshold, created_at, updated_at, name) VALUES (10, 1550, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', 'Хранитель Гикотеки');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (1, 'arcade', 'Arcade', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (2, 'book', 'Book', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (3, 'comic-book', 'Comic Book', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (5, 'gamecube', 'GameCube', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (6, 'mobile', 'Mobile', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (7, 'n64', 'N64', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (8, 'nes', 'NES', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (9, 'pc', 'PC', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (10, 'ps1', 'PS1', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (11, 'ps2', 'PS2', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (12, 'ps3', 'PS3', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (13, 'ps4', 'PS4', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (14, 'sega', 'Sega', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (15, 'snes', 'SNES', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (17, 'switch', 'Switch', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (18, 'wii', 'Wii', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (19, 'zx-spectrum', 'ZX Spectrum', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.341682+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (4, 'dvd', 'DVD', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.443514+00');
--> statement-breakpoint
INSERT INTO public.media_carriers (id, code, name, description, created_at, updated_at) VALUES (16, 'streaming', 'Streaming', NULL, '2026-11-04 16:49:55.341682+00', '2026-11-04 16:49:55.443514+00');
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (1, 'game', 'Игра', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (2, 'film', 'Фильм', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (3, 'series', 'Сериал', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (4, 'book', 'Книга', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (5, 'comic', 'Комикс', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (6, 'anime', 'Аниме', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (7, 'other', 'Другое', NULL, '2026-11-04 16:49:55.39196+00', '2026-11-04 16:49:55.39196+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (8, 'roblox', 'Roblox', 'Experiences Roblox', '2026-11-04 16:49:55.721395+00', '2026-11-04 16:49:55.721395+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_types (id, code, name, description, created_at, updated_at, is_publicly_available, enabled_by_default, is_available_to_guests) VALUES (9, 'manga', 'Манга', 'Манга, манхва, маньхуа и вебтуны', '2026-11-04 16:49:56.929107+00', '2026-11-04 16:49:56.929107+00', true, true, true);
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (1, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (2, 'book');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (3, 'comic');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (4, 'film');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (5, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (6, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (7, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (8, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (9, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (10, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (11, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (12, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (13, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (14, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (15, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (16, 'film');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (17, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (18, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (19, 'game');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (4, 'anime');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (4, 'series');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (16, 'anime');
--> statement-breakpoint
INSERT INTO public.media_carrier_media_types (media_carrier_id, media_type) VALUES (16, 'series');
--> statement-breakpoint
INSERT INTO public.notification_transport_routes (code, transport_codes, updated_by_admin_id, created_at, updated_at) VALUES ('bug_report_created', '[]', NULL, '2026-11-04 16:49:55.787033+00', '2026-11-04 16:49:55.787033+00');
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (1, '3do-interactive-multiplayer', '3DO Interactive Multiplayer', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (2, 'acorn-archimedes', 'Acorn Archimedes', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (3, 'acorn-electron', 'Acorn Electron', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (4, 'amiga', 'Amiga', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (5, 'amiga-cd32', 'Amiga CD32', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (6, 'amstrad-cpc', 'Amstrad CPC', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (7, 'android', 'Android', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (8, 'apple-ii', 'Apple II', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (9, 'apple-iigs', 'Apple IIGS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (10, 'arcade', 'Arcade', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (11, 'atari-2600', 'Atari 2600', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (12, 'atari-8-bit', 'Atari 8-bit', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (13, 'atari-jaguar', 'Atari Jaguar', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (14, 'atari-jaguar-cd', 'Atari Jaguar CD', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (15, 'atari-st-ste', 'Atari ST/STE', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (16, 'bbc-microcomputer-system', 'BBC Microcomputer System', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (17, 'blackberry-os', 'BlackBerry OS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (18, 'classic-macintosh', 'Classic Macintosh', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (19, 'commodore-16', 'Commodore 16', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (20, 'commodore-c64-128-max', 'Commodore C64/128/MAX', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (21, 'dos', 'DOS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (22, 'dreamcast', 'Dreamcast', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (23, 'fm-towns', 'FM Towns', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (24, 'fm-7', 'FM-7', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (25, 'family-computer', 'Family Computer', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (26, 'family-computer-disk-system', 'Family Computer Disk System', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (27, 'game-boy', 'Game Boy', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (28, 'game-boy-advance', 'Game Boy Advance', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (29, 'game-boy-color', 'Game Boy Color', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (30, 'gizmondo', 'Gizmondo', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (31, 'google-stadia', 'Google Stadia', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (32, 'handheld-electronic-lcd', 'Handheld Electronic LCD', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (33, 'laseractive', 'LaserActive', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (34, 'legacy-mobile-device', 'Legacy Mobile Device', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (35, 'pc', 'PC', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (36, 'msx', 'MSX', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (37, 'mac', 'Mac', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (38, 'meta-quest-2', 'Meta Quest 2', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (39, 'meta-quest-3', 'Meta Quest 3', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (40, 'n-gage', 'N-Gage', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (41, 'nes', 'NES', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (42, 'neo-geo-aes', 'Neo Geo AES', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (43, 'neo-geo-cd', 'Neo Geo CD', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (44, 'neo-geo-mvs', 'Neo Geo MVS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (45, 'new-nintendo-3ds', 'New Nintendo 3DS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (46, 'nintendo-3ds', 'Nintendo 3DS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (47, 'nintendo-64', 'Nintendo 64', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (48, 'nintendo-ds', 'Nintendo DS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (49, 'nintendo-dsi', 'Nintendo DSi', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (50, 'nintendo-entertainment-system', 'Nintendo Entertainment System', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (51, 'nintendo-gamecube', 'Nintendo GameCube', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (52, 'nintendo-switch', 'Nintendo Switch', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (53, 'nintendo-switch-2', 'Nintendo Switch 2', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (54, 'oculus-rift', 'Oculus Rift', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (55, 'odyssey-2-videopac-g7000', 'Odyssey 2 / Videopac G7000', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (56, 'onlive-game-system', 'OnLive Game System', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (57, 'ouya', 'Ouya', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (58, 'pc-8800-series', 'PC-8800 Series', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (59, 'pc-9800-series', 'PC-9800 Series', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (60, 'philips-cd-i', 'Philips CD-i', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (61, 'playstation', 'PlayStation', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (62, 'playstation-2', 'PlayStation 2', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (63, 'playstation-3', 'PlayStation 3', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (64, 'playstation-4', 'PlayStation 4', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (65, 'playstation-5', 'PlayStation 5', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (66, 'playstation-portable', 'PlayStation Portable', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (67, 'playstation-vr', 'PlayStation VR', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (68, 'playstation-vr2', 'PlayStation VR2', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (69, 'playstation-vita', 'PlayStation Vita', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (70, 'plug-play', 'Plug & Play', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (71, 'sg-1000', 'SG-1000', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (72, 'sega-32x', 'Sega 32X', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (73, 'sega-cd', 'Sega CD', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (74, 'sega-game-gear', 'Sega Game Gear', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (75, 'sega-master-system-mark-iii', 'Sega Master System/Mark III', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (76, 'sega-mega-drive-genesis', 'Sega Mega Drive/Genesis', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (77, 'sega-saturn', 'Sega Saturn', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (78, 'sharp-x1', 'Sharp X1', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (79, 'sharp-x68000', 'Sharp X68000', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (80, 'sinclair-zx81', 'Sinclair ZX81', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (81, 'steamvr', 'SteamVR', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (82, 'super-famicom', 'Super Famicom', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (83, 'super-nintendo-entertainment-system', 'Super Nintendo Entertainment System', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (84, 'trs-80', 'TRS-80', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (85, 'trs-80-color-computer', 'TRS-80 Color Computer', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (86, 'tapwave-zodiac', 'Tapwave Zodiac', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (87, 'tatung-einstein', 'Tatung Einstein', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (88, 'turbografx-16-pc-engine', 'TurboGrafx-16/PC Engine', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (89, 'web-browser', 'Web browser', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (90, 'wii', 'Wii', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (91, 'wii-u', 'Wii U', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (92, 'windows-mixed-reality', 'Windows Mixed Reality', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (93, 'windows-mobile', 'Windows Mobile', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (94, 'windows-phone', 'Windows Phone', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (95, 'xbox', 'Xbox', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (96, 'xbox-360', 'Xbox 360', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (97, 'xbox-one', 'Xbox One', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (98, 'xbox-series-x-s', 'Xbox Series X|S', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (99, 'zx-spectrum', 'ZX Spectrum', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (100, 'zeebo', 'Zeebo', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (101, 'ios', 'iOS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.platforms (id, slug, name, is_active, created_at, updated_at, logo_mode, manual_logo_object_key, manual_logo_content_hash, imported_logo_object_key, imported_logo_content_hash, imported_logo_provider, imported_logo_external_id, imported_logo_image_key, logo_version) VALUES (102, 'visionos', 'visionOS', true, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', 'exact', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0);
--> statement-breakpoint
INSERT INTO public.provider_genre_exclusions (id, provider, media_type, external_genre_name, normalized_external_genre_name, created_at, updated_at) VALUES (1, 'tmdb', 'film', 'телевизионный фильм', 'телевизионный фильм', '2026-11-04 16:49:56.008005+00', '2026-11-04 16:49:56.008005+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_exclusions (id, provider, media_type, external_genre_name, normalized_external_genre_name, created_at, updated_at) VALUES (2, 'tmdb', 'film', 'TV Movie', 'tv movie', '2026-11-04 16:49:56.008005+00', '2026-11-04 16:49:56.008005+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (1, 'anilist', 'anime', NULL, 'Action', 'action', 1, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (2, 'tmdb', 'series', NULL, 'Боевик и Приключения', 'боевик и приключения', 1, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (3, 'tmdb', 'film', NULL, 'боевик', 'боевик', 1, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (4, 'anilist', 'anime', NULL, 'Comedy', 'comedy', 2, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (5, 'tmdb', 'series', NULL, 'комедия', 'комедия', 2, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (6, 'tmdb', 'film', NULL, 'комедия', 'комедия', 2, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (7, 'anilist', 'anime', NULL, 'Adventure', 'adventure', 3, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (8, 'tmdb', 'series', NULL, 'Боевик и Приключения', 'боевик и приключения', 3, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (9, 'tmdb', 'film', NULL, 'приключения', 'приключения', 3, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (10, 'anilist', 'anime', NULL, 'Drama', 'drama', 4, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (11, 'tmdb', 'series', NULL, 'драма', 'драма', 4, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (12, 'tmdb', 'film', NULL, 'драма', 'драма', 4, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (13, 'anilist', 'anime', NULL, 'Thriller', 'thriller', 5, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (14, 'tmdb', 'film', NULL, 'триллер', 'триллер', 5, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (15, 'anilist', 'anime', NULL, 'Sci-Fi', 'sci-fi', 6, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (16, 'tmdb', 'series', NULL, 'НФ и Фэнтези', 'нф и фэнтези', 6, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (17, 'tmdb', 'film', NULL, 'фантастика', 'фантастика', 6, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (18, 'anilist', 'anime', NULL, 'Horror', 'horror', 7, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (19, 'tmdb', 'film', NULL, 'ужасы', 'ужасы', 7, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (20, 'anilist', 'anime', NULL, 'Fantasy', 'fantasy', 8, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (21, 'tmdb', 'series', NULL, 'НФ и Фэнтези', 'нф и фэнтези', 8, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (22, 'tmdb', 'film', NULL, 'фэнтези', 'фэнтези', 8, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (23, 'tmdb', 'series', NULL, 'семейный', 'семейный', 9, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (24, 'tmdb', 'film', NULL, 'семейный', 'семейный', 9, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (25, 'tmdb', 'series', NULL, 'криминал', 'криминал', 10, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (26, 'tmdb', 'film', NULL, 'криминал', 'криминал', 10, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (27, 'tmdb', 'film', NULL, 'мелодрама', 'мелодрама', 11, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (28, 'tmdb', 'series', NULL, 'Animation', 'animation', 12, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (29, 'tmdb', 'series', NULL, 'мультфильм', 'мультфильм', 12, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (30, 'tmdb', 'film', NULL, 'мультфильм', 'мультфильм', 12, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (31, 'anilist', 'anime', NULL, 'Mystery', 'mystery', 13, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (32, 'tmdb', 'series', NULL, 'детектив', 'детектив', 13, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (33, 'tmdb', 'film', NULL, 'детектив', 'детектив', 13, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (34, 'tmdb', 'film', NULL, 'история', 'история', 14, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (35, 'tmdb', 'series', NULL, 'Война и Политика', 'война и политика', 15, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (36, 'tmdb', 'film', NULL, 'военный', 'военный', 15, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (37, 'tmdb', 'series', NULL, 'вестерн', 'вестерн', 16, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (38, 'tmdb', 'film', NULL, 'вестерн', 'вестерн', 16, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (39, 'anilist', 'anime', NULL, 'Music', 'music', 17, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (40, 'tmdb', 'film', NULL, 'музыка', 'музыка', 17, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (41, 'tmdb', 'series', NULL, 'документальный', 'документальный', 18, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (42, 'tmdb', 'film', NULL, 'документальный', 'документальный', 18, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (43, 'tmdb', 'series', NULL, 'детский', 'детский', 19, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (44, 'tmdb', 'series', NULL, 'Война и Политика', 'война и политика', 20, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (45, 'tmdb', 'series', NULL, 'мыльная опера', 'мыльная опера', 21, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (46, 'anilist', 'anime', NULL, 'Romance', 'romance', 22, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (47, 'anilist', 'anime', NULL, 'Supernatural', 'supernatural', 23, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (48, 'anilist', 'anime', NULL, 'Psychological', 'psychological', 24, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (49, 'anilist', 'anime', NULL, 'Slice of Life', 'slice of life', 25, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (50, 'anilist', 'anime', NULL, 'Mecha', 'mecha', 26, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (51, 'anilist', 'anime', NULL, 'Ecchi', 'ecchi', 27, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (52, 'anilist', 'anime', NULL, 'Hentai', 'hentai', 28, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (53, 'anilist', 'anime', NULL, 'Sports', 'sports', 29, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (54, 'rawg', 'game', NULL, 'Adventure', 'adventure', 30, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (55, 'igdb', 'game', NULL, 'Adventure', 'adventure', 30, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (56, 'rawg', 'game', NULL, 'Action', 'action', 31, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (57, 'igdb', 'game', NULL, 'Hack and slash/Beat ''em up', 'hack and slash/beat ''em up', 32, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (58, 'igdb', 'game', NULL, 'Card & Board Game', 'card & board game', 33, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (59, 'rawg', 'game', NULL, 'Card', 'card', 34, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (60, 'rawg', 'game', NULL, 'Indie', 'indie', 35, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (61, 'igdb', 'game', NULL, 'Indie', 'indie', 35, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (62, 'rawg', 'game', NULL, 'Shooter', 'shooter', 36, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (63, 'igdb', 'game', NULL, 'Shooter', 'shooter', 36, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (64, 'rawg', 'game', NULL, 'Puzzle', 'puzzle', 37, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (65, 'igdb', 'game', NULL, 'Puzzle', 'puzzle', 37, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (66, 'rawg', 'game', NULL, 'RPG', 'rpg', 38, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (67, 'igdb', 'game', NULL, 'Role-playing (RPG)', 'role-playing (rpg)', 38, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (68, 'rawg', 'game', NULL, 'Platformer', 'platformer', 39, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (69, 'igdb', 'game', NULL, 'Platform', 'platform', 39, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (70, 'rawg', 'game', NULL, 'Strategy', 'strategy', 40, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (71, 'igdb', 'game', NULL, 'Strategy', 'strategy', 40, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (72, 'rawg', 'game', NULL, 'Simulation', 'simulation', 41, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (73, 'igdb', 'game', NULL, 'Simulator', 'simulator', 41, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (74, 'rawg', 'game', NULL, 'Arcade', 'arcade', 42, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (75, 'igdb', 'game', NULL, 'Arcade', 'arcade', 42, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (76, 'igdb', 'game', NULL, 'Point-and-click', 'point-and-click', 43, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (77, 'igdb', 'game', NULL, 'Real Time Strategy (RTS)', 'real time strategy (rts)', 44, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (78, 'rawg', 'game', NULL, 'Racing', 'racing', 45, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (79, 'igdb', 'game', NULL, 'Racing', 'racing', 45, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (80, 'igdb', 'game', NULL, 'Tactical', 'tactical', 46, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (81, 'igdb', 'game', NULL, 'Turn-based strategy (TBS)', 'turn-based strategy (tbs)', 47, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (82, 'rawg', 'game', NULL, 'Fighting', 'fighting', 48, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (83, 'igdb', 'game', NULL, 'Fighting', 'fighting', 48, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (84, 'rawg', 'game', NULL, 'Sports', 'sports', 49, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (85, 'igdb', 'game', NULL, 'Sport', 'sport', 49, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (86, 'igdb', 'game', NULL, 'Music', 'music', 50, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (87, 'igdb', 'game', NULL, 'Visual Novel', 'visual novel', 51, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (88, 'igdb', 'game', NULL, 'MOBA', 'moba', 52, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (89, 'rawg', 'game', NULL, 'Casual', 'casual', 53, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (90, 'tmdb', 'anime', NULL, 'Animation', 'animation', 12, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (91, 'tmdb', 'anime', NULL, 'Боевик и Приключения', 'боевик и приключения', 1, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (92, 'tmdb', 'anime', NULL, 'Боевик и Приключения', 'боевик и приключения', 3, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (93, 'tmdb', 'anime', NULL, 'вестерн', 'вестерн', 16, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (94, 'tmdb', 'anime', NULL, 'Война и Политика', 'война и политика', 15, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (95, 'tmdb', 'anime', NULL, 'Война и Политика', 'война и политика', 20, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (96, 'tmdb', 'anime', NULL, 'детектив', 'детектив', 13, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (97, 'tmdb', 'anime', NULL, 'детский', 'детский', 19, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (98, 'tmdb', 'anime', NULL, 'документальный', 'документальный', 18, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (99, 'tmdb', 'anime', NULL, 'драма', 'драма', 4, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (100, 'tmdb', 'anime', NULL, 'комедия', 'комедия', 2, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (101, 'tmdb', 'anime', NULL, 'криминал', 'криминал', 10, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (102, 'tmdb', 'anime', NULL, 'мультфильм', 'мультфильм', 12, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (103, 'tmdb', 'anime', NULL, 'мыльная опера', 'мыльная опера', 21, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (104, 'tmdb', 'anime', NULL, 'НФ и Фэнтези', 'нф и фэнтези', 6, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (105, 'tmdb', 'anime', NULL, 'НФ и Фэнтези', 'нф и фэнтези', 8, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_genre_mappings (id, provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id, created_at, updated_at) VALUES (106, 'tmdb', 'anime', NULL, 'семейный', 'семейный', 9, '2026-11-04 16:49:55.979904+00', '2026-11-04 16:49:55.979904+00');
--> statement-breakpoint
INSERT INTO public.provider_image_settings (provider_code, proxy_images_enabled, updated_by_admin_id, created_at, updated_at) VALUES ('roblox', true, NULL, '2026-11-04 16:49:55.721395+00', '2026-11-04 16:49:55.721395+00');
--> statement-breakpoint
INSERT INTO public.provider_image_settings (provider_code, proxy_images_enabled, updated_by_admin_id, created_at, updated_at) VALUES ('mangaupdates', true, NULL, '2026-11-04 16:49:56.929107+00', '2026-11-04 16:49:56.929107+00');
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (1, 'igdb', 'game', '3DO Interactive Multiplayer', '3do interactive multiplayer', 1, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (2, 'rawg', 'game', '3DO Interactive Multiplayer', '3do interactive multiplayer', 1, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (3, 'igdb', 'game', 'Acorn Archimedes', 'acorn archimedes', 2, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (4, 'rawg', 'game', 'Acorn Archimedes', 'acorn archimedes', 2, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (5, 'igdb', 'game', 'Acorn Electron', 'acorn electron', 3, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (6, 'rawg', 'game', 'Acorn Electron', 'acorn electron', 3, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (7, 'igdb', 'game', 'Amiga', 'amiga', 4, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (8, 'rawg', 'game', 'Amiga', 'amiga', 4, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (9, 'igdb', 'game', 'Amiga CD32', 'amiga cd32', 5, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (10, 'rawg', 'game', 'Amiga CD32', 'amiga cd32', 5, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (11, 'igdb', 'game', 'Amstrad CPC', 'amstrad cpc', 6, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (12, 'rawg', 'game', 'Amstrad CPC', 'amstrad cpc', 6, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (13, 'igdb', 'game', 'Android', 'android', 7, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (14, 'rawg', 'game', 'Android', 'android', 7, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (15, 'igdb', 'game', 'Apple II', 'apple ii', 8, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (16, 'rawg', 'game', 'Apple II', 'apple ii', 8, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (17, 'igdb', 'game', 'Apple IIGS', 'apple iigs', 9, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (18, 'rawg', 'game', 'Apple IIGS', 'apple iigs', 9, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (19, 'igdb', 'game', 'Arcade', 'arcade', 10, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (20, 'rawg', 'game', 'Arcade', 'arcade', 10, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (21, 'igdb', 'game', 'Atari 2600', 'atari 2600', 11, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (22, 'rawg', 'game', 'Atari 2600', 'atari 2600', 11, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (23, 'igdb', 'game', 'Atari 8-bit', 'atari 8-bit', 12, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (24, 'rawg', 'game', 'Atari 8-bit', 'atari 8-bit', 12, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (25, 'igdb', 'game', 'Atari Jaguar', 'atari jaguar', 13, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (26, 'rawg', 'game', 'Atari Jaguar', 'atari jaguar', 13, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (27, 'igdb', 'game', 'Atari Jaguar CD', 'atari jaguar cd', 14, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (28, 'rawg', 'game', 'Atari Jaguar CD', 'atari jaguar cd', 14, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (29, 'igdb', 'game', 'Atari ST/STE', 'atari st/ste', 15, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (30, 'rawg', 'game', 'Atari ST/STE', 'atari st/ste', 15, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (31, 'igdb', 'game', 'BBC Microcomputer System', 'bbc microcomputer system', 16, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (32, 'rawg', 'game', 'BBC Microcomputer System', 'bbc microcomputer system', 16, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (33, 'igdb', 'game', 'BlackBerry OS', 'blackberry os', 17, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (34, 'rawg', 'game', 'BlackBerry OS', 'blackberry os', 17, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (35, 'igdb', 'game', 'Classic Macintosh', 'classic macintosh', 18, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (36, 'rawg', 'game', 'Classic Macintosh', 'classic macintosh', 18, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (37, 'igdb', 'game', 'Commodore 16', 'commodore 16', 19, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (38, 'rawg', 'game', 'Commodore 16', 'commodore 16', 19, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (39, 'igdb', 'game', 'Commodore C64/128/MAX', 'commodore c64/128/max', 20, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (40, 'rawg', 'game', 'Commodore C64/128/MAX', 'commodore c64/128/max', 20, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (41, 'igdb', 'game', 'DOS', 'dos', 21, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (42, 'rawg', 'game', 'DOS', 'dos', 21, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (43, 'igdb', 'game', 'Dreamcast', 'dreamcast', 22, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (44, 'rawg', 'game', 'Dreamcast', 'dreamcast', 22, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (45, 'igdb', 'game', 'FM Towns', 'fm towns', 23, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (46, 'rawg', 'game', 'FM Towns', 'fm towns', 23, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (47, 'igdb', 'game', 'FM-7', 'fm-7', 24, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (48, 'rawg', 'game', 'FM-7', 'fm-7', 24, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (49, 'igdb', 'game', 'Family Computer', 'family computer', 25, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (50, 'rawg', 'game', 'Family Computer', 'family computer', 25, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (51, 'igdb', 'game', 'Family Computer Disk System', 'family computer disk system', 26, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (52, 'rawg', 'game', 'Family Computer Disk System', 'family computer disk system', 26, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (53, 'igdb', 'game', 'Game Boy', 'game boy', 27, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (54, 'rawg', 'game', 'Game Boy', 'game boy', 27, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (55, 'igdb', 'game', 'Game Boy Advance', 'game boy advance', 28, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (56, 'rawg', 'game', 'Game Boy Advance', 'game boy advance', 28, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (57, 'igdb', 'game', 'Game Boy Color', 'game boy color', 29, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (58, 'rawg', 'game', 'Game Boy Color', 'game boy color', 29, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (59, 'igdb', 'game', 'Gizmondo', 'gizmondo', 30, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (60, 'rawg', 'game', 'Gizmondo', 'gizmondo', 30, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (61, 'igdb', 'game', 'Google Stadia', 'google stadia', 31, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (62, 'rawg', 'game', 'Google Stadia', 'google stadia', 31, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (63, 'igdb', 'game', 'Handheld Electronic LCD', 'handheld electronic lcd', 32, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (64, 'rawg', 'game', 'Handheld Electronic LCD', 'handheld electronic lcd', 32, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (65, 'igdb', 'game', 'LaserActive', 'laseractive', 33, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (66, 'rawg', 'game', 'LaserActive', 'laseractive', 33, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (67, 'igdb', 'game', 'Legacy Mobile Device', 'legacy mobile device', 34, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (68, 'rawg', 'game', 'Legacy Mobile Device', 'legacy mobile device', 34, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (69, 'igdb', 'game', 'PC (Microsoft Windows)', 'pc (microsoft windows)', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (70, 'rawg', 'game', 'PC (Microsoft Windows)', 'pc (microsoft windows)', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (71, 'igdb', 'game', 'PC', 'pc', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (72, 'rawg', 'game', 'PC', 'pc', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (73, 'igdb', 'game', 'Linux', 'linux', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (74, 'rawg', 'game', 'Linux', 'linux', 35, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (75, 'igdb', 'game', 'MSX', 'msx', 36, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (76, 'rawg', 'game', 'MSX', 'msx', 36, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (77, 'igdb', 'game', 'macOS', 'macos', 37, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (78, 'rawg', 'game', 'macOS', 'macos', 37, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (79, 'igdb', 'game', 'Mac', 'mac', 37, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (80, 'rawg', 'game', 'Mac', 'mac', 37, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (81, 'igdb', 'game', 'Meta Quest 2', 'meta quest 2', 38, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (82, 'rawg', 'game', 'Meta Quest 2', 'meta quest 2', 38, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (83, 'igdb', 'game', 'Meta Quest 3', 'meta quest 3', 39, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (84, 'rawg', 'game', 'Meta Quest 3', 'meta quest 3', 39, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (85, 'igdb', 'game', 'N-Gage', 'n-gage', 40, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (86, 'rawg', 'game', 'N-Gage', 'n-gage', 40, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (87, 'igdb', 'game', 'NES', 'nes', 41, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (88, 'rawg', 'game', 'NES', 'nes', 41, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (89, 'igdb', 'game', 'Neo Geo AES', 'neo geo aes', 42, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (90, 'rawg', 'game', 'Neo Geo AES', 'neo geo aes', 42, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (91, 'igdb', 'game', 'Neo Geo CD', 'neo geo cd', 43, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (92, 'rawg', 'game', 'Neo Geo CD', 'neo geo cd', 43, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (93, 'igdb', 'game', 'Neo Geo MVS', 'neo geo mvs', 44, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (94, 'rawg', 'game', 'Neo Geo MVS', 'neo geo mvs', 44, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (95, 'igdb', 'game', 'New Nintendo 3DS', 'new nintendo 3ds', 45, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (96, 'rawg', 'game', 'New Nintendo 3DS', 'new nintendo 3ds', 45, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (97, 'igdb', 'game', 'Nintendo 3DS', 'nintendo 3ds', 46, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (98, 'rawg', 'game', 'Nintendo 3DS', 'nintendo 3ds', 46, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (99, 'igdb', 'game', 'Nintendo 64', 'nintendo 64', 47, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (100, 'rawg', 'game', 'Nintendo 64', 'nintendo 64', 47, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (101, 'igdb', 'game', 'Nintendo DS', 'nintendo ds', 48, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (102, 'rawg', 'game', 'Nintendo DS', 'nintendo ds', 48, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (103, 'igdb', 'game', 'Nintendo DSi', 'nintendo dsi', 49, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (104, 'rawg', 'game', 'Nintendo DSi', 'nintendo dsi', 49, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (105, 'igdb', 'game', 'Nintendo Entertainment System', 'nintendo entertainment system', 50, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (106, 'rawg', 'game', 'Nintendo Entertainment System', 'nintendo entertainment system', 50, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (107, 'igdb', 'game', 'Nintendo GameCube', 'nintendo gamecube', 51, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (108, 'rawg', 'game', 'Nintendo GameCube', 'nintendo gamecube', 51, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (109, 'igdb', 'game', 'Nintendo Switch', 'nintendo switch', 52, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (110, 'rawg', 'game', 'Nintendo Switch', 'nintendo switch', 52, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (111, 'igdb', 'game', 'Nintendo Switch 2', 'nintendo switch 2', 53, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (112, 'rawg', 'game', 'Nintendo Switch 2', 'nintendo switch 2', 53, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (113, 'igdb', 'game', 'Oculus Rift', 'oculus rift', 54, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (114, 'rawg', 'game', 'Oculus Rift', 'oculus rift', 54, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (115, 'igdb', 'game', 'Odyssey 2 / Videopac G7000', 'odyssey 2 / videopac g7000', 55, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (116, 'rawg', 'game', 'Odyssey 2 / Videopac G7000', 'odyssey 2 / videopac g7000', 55, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (117, 'igdb', 'game', 'OnLive Game System', 'onlive game system', 56, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (118, 'rawg', 'game', 'OnLive Game System', 'onlive game system', 56, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (119, 'igdb', 'game', 'Ouya', 'ouya', 57, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (120, 'rawg', 'game', 'Ouya', 'ouya', 57, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (121, 'igdb', 'game', 'PC-8800 Series', 'pc-8800 series', 58, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (122, 'rawg', 'game', 'PC-8800 Series', 'pc-8800 series', 58, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (123, 'igdb', 'game', 'PC-9800 Series', 'pc-9800 series', 59, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (124, 'rawg', 'game', 'PC-9800 Series', 'pc-9800 series', 59, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (125, 'igdb', 'game', 'Philips CD-i', 'philips cd-i', 60, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (126, 'rawg', 'game', 'Philips CD-i', 'philips cd-i', 60, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (127, 'igdb', 'game', 'PlayStation', 'playstation', 61, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (128, 'rawg', 'game', 'PlayStation', 'playstation', 61, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (129, 'igdb', 'game', 'PlayStation 2', 'playstation 2', 62, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (130, 'rawg', 'game', 'PlayStation 2', 'playstation 2', 62, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (131, 'igdb', 'game', 'PlayStation 3', 'playstation 3', 63, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (132, 'rawg', 'game', 'PlayStation 3', 'playstation 3', 63, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (133, 'igdb', 'game', 'PlayStation 4', 'playstation 4', 64, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (134, 'rawg', 'game', 'PlayStation 4', 'playstation 4', 64, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (135, 'igdb', 'game', 'PlayStation 5', 'playstation 5', 65, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (136, 'rawg', 'game', 'PlayStation 5', 'playstation 5', 65, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (137, 'igdb', 'game', 'PlayStation Portable', 'playstation portable', 66, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (138, 'rawg', 'game', 'PlayStation Portable', 'playstation portable', 66, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (139, 'igdb', 'game', 'PlayStation VR', 'playstation vr', 67, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (140, 'rawg', 'game', 'PlayStation VR', 'playstation vr', 67, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (141, 'igdb', 'game', 'PlayStation VR2', 'playstation vr2', 68, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (142, 'rawg', 'game', 'PlayStation VR2', 'playstation vr2', 68, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (143, 'igdb', 'game', 'PlayStation Vita', 'playstation vita', 69, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (144, 'rawg', 'game', 'PlayStation Vita', 'playstation vita', 69, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (145, 'igdb', 'game', 'Plug & Play', 'plug & play', 70, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (146, 'rawg', 'game', 'Plug & Play', 'plug & play', 70, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (147, 'igdb', 'game', 'SG-1000', 'sg-1000', 71, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (148, 'rawg', 'game', 'SG-1000', 'sg-1000', 71, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (149, 'igdb', 'game', 'Sega 32X', 'sega 32x', 72, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (150, 'rawg', 'game', 'Sega 32X', 'sega 32x', 72, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (151, 'igdb', 'game', 'Sega CD', 'sega cd', 73, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (152, 'rawg', 'game', 'Sega CD', 'sega cd', 73, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (153, 'igdb', 'game', 'Sega Game Gear', 'sega game gear', 74, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (154, 'rawg', 'game', 'Sega Game Gear', 'sega game gear', 74, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (155, 'igdb', 'game', 'Sega Master System/Mark III', 'sega master system/mark iii', 75, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (156, 'rawg', 'game', 'Sega Master System/Mark III', 'sega master system/mark iii', 75, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (157, 'igdb', 'game', 'Sega Mega Drive/Genesis', 'sega mega drive/genesis', 76, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (158, 'rawg', 'game', 'Sega Mega Drive/Genesis', 'sega mega drive/genesis', 76, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (159, 'igdb', 'game', 'Sega Saturn', 'sega saturn', 77, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (160, 'rawg', 'game', 'Sega Saturn', 'sega saturn', 77, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (161, 'igdb', 'game', 'Sharp X1', 'sharp x1', 78, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (162, 'rawg', 'game', 'Sharp X1', 'sharp x1', 78, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (163, 'igdb', 'game', 'Sharp X68000', 'sharp x68000', 79, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (164, 'rawg', 'game', 'Sharp X68000', 'sharp x68000', 79, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (165, 'igdb', 'game', 'Sinclair ZX81', 'sinclair zx81', 80, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (166, 'rawg', 'game', 'Sinclair ZX81', 'sinclair zx81', 80, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (167, 'igdb', 'game', 'SteamVR', 'steamvr', 81, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (168, 'rawg', 'game', 'SteamVR', 'steamvr', 81, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (169, 'igdb', 'game', 'Super Famicom', 'super famicom', 82, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (170, 'rawg', 'game', 'Super Famicom', 'super famicom', 82, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (171, 'igdb', 'game', 'Super Nintendo Entertainment System', 'super nintendo entertainment system', 83, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (172, 'rawg', 'game', 'Super Nintendo Entertainment System', 'super nintendo entertainment system', 83, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (173, 'igdb', 'game', 'TRS-80', 'trs-80', 84, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (174, 'rawg', 'game', 'TRS-80', 'trs-80', 84, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (175, 'igdb', 'game', 'TRS-80 Color Computer', 'trs-80 color computer', 85, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (176, 'rawg', 'game', 'TRS-80 Color Computer', 'trs-80 color computer', 85, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (177, 'igdb', 'game', 'Tapwave Zodiac', 'tapwave zodiac', 86, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (178, 'rawg', 'game', 'Tapwave Zodiac', 'tapwave zodiac', 86, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (179, 'igdb', 'game', 'Tatung Einstein', 'tatung einstein', 87, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (180, 'rawg', 'game', 'Tatung Einstein', 'tatung einstein', 87, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (181, 'igdb', 'game', 'TurboGrafx-16/PC Engine', 'turbografx-16/pc engine', 88, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (182, 'rawg', 'game', 'TurboGrafx-16/PC Engine', 'turbografx-16/pc engine', 88, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (183, 'igdb', 'game', 'Web browser', 'web browser', 89, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (184, 'rawg', 'game', 'Web browser', 'web browser', 89, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (185, 'igdb', 'game', 'Wii', 'wii', 90, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (186, 'rawg', 'game', 'Wii', 'wii', 90, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (187, 'igdb', 'game', 'Wii U', 'wii u', 91, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (188, 'rawg', 'game', 'Wii U', 'wii u', 91, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (189, 'igdb', 'game', 'Windows Mixed Reality', 'windows mixed reality', 92, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (190, 'rawg', 'game', 'Windows Mixed Reality', 'windows mixed reality', 92, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (191, 'igdb', 'game', 'Windows Mobile', 'windows mobile', 93, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (192, 'rawg', 'game', 'Windows Mobile', 'windows mobile', 93, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (193, 'igdb', 'game', 'Windows Phone', 'windows phone', 94, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (194, 'rawg', 'game', 'Windows Phone', 'windows phone', 94, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (195, 'igdb', 'game', 'Xbox', 'xbox', 95, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (196, 'rawg', 'game', 'Xbox', 'xbox', 95, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (197, 'igdb', 'game', 'Xbox 360', 'xbox 360', 96, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (198, 'rawg', 'game', 'Xbox 360', 'xbox 360', 96, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (199, 'igdb', 'game', 'Xbox One', 'xbox one', 97, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (200, 'rawg', 'game', 'Xbox One', 'xbox one', 97, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (201, 'igdb', 'game', 'Xbox Series X|S', 'xbox series x|s', 98, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (202, 'rawg', 'game', 'Xbox Series X|S', 'xbox series x|s', 98, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (203, 'igdb', 'game', 'Xbox Series S/X', 'xbox series s/x', 98, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (204, 'rawg', 'game', 'Xbox Series S/X', 'xbox series s/x', 98, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (205, 'igdb', 'game', 'ZX Spectrum', 'zx spectrum', 99, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (206, 'rawg', 'game', 'ZX Spectrum', 'zx spectrum', 99, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (207, 'igdb', 'game', 'Zeebo', 'zeebo', 100, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (208, 'rawg', 'game', 'Zeebo', 'zeebo', 100, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (209, 'igdb', 'game', 'iOS', 'ios', 101, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (210, 'rawg', 'game', 'iOS', 'ios', 101, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (211, 'igdb', 'game', 'visionOS', 'visionos', 102, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_platform_mappings (id, provider, media_type, external_platform_name, normalized_external_platform_name, platform_id, created_at, updated_at, external_platform_id) VALUES (212, 'rawg', 'game', 'visionOS', 'visionos', 102, '2026-11-04 16:49:56.633877+00', '2026-11-04 16:49:56.633877+00', NULL);
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('tmdb', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('open-library', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('google-books', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('igdb', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('rawg', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('jikan', 1000, '2026-11-04 16:49:55.438966+00', '2026-11-04 16:49:55.438966+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('anilist', 1000, '2026-11-04 16:49:55.550295+00', '2026-11-04 16:49:55.550295+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('fantlab', 1000, '2026-11-04 16:49:55.559011+00', '2026-11-04 16:49:55.559011+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('roblox', 500, '2026-11-04 16:49:55.721395+00', '2026-11-04 16:49:55.721395+00');
--> statement-breakpoint
INSERT INTO public.provider_rate_limits (provider_code, searches_per_day, created_at, updated_at) VALUES ('mangaupdates', 1000, '2026-11-04 16:49:56.929107+00', '2026-11-04 16:49:56.929107+00');
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('film', 'tmdb', true, 10, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('series', 'tmdb', true, 10, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('book', 'open-library', true, 10, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('book', 'google-books', true, 20, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('game', 'igdb', true, 10, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('game', 'rawg', true, 20, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('anime', 'jikan', true, 10, '2026-11-04 16:49:55.417015+00', '2026-11-04 16:49:55.433831+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('comic', 'comic-vine', true, 10, '2026-11-04 16:49:55.483688+00', '2026-11-04 16:49:55.483688+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('anime', 'anilist', true, 20, '2026-11-04 16:49:55.550295+00', '2026-11-04 16:49:55.550295+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('book', 'fantlab', true, 30, '2026-11-04 16:49:55.559011+00', '2026-11-04 16:49:55.559011+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('anime', 'tmdb', true, 30, '2026-11-04 16:49:55.550295+00', '2026-11-04 16:49:55.550295+00', 'off', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('roblox', 'roblox', true, 10, '2026-11-04 16:49:55.721395+00', '2026-11-04 16:49:55.721395+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.provider_settings (media_type, provider_code, enabled, priority, created_at, updated_at, title_search_mode, cover_search_enabled) VALUES ('manga', 'mangaupdates', true, 10, '2026-11-04 16:49:56.929107+00', '2026-11-04 16:49:56.929107+00', 'parallel', true);
--> statement-breakpoint
INSERT INTO public.toast_settings (id, site_duration_seconds, admin_duration_seconds, updated_by_admin_id, created_at, updated_at) VALUES (1, 5, 5, NULL, '2026-11-04 16:49:55.775405+00', '2026-11-04 16:49:55.775405+00');
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('rating.created', 1, 10, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', false);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('series.link-existing.published', 1, 20, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', true);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('series.link-removal.published', 1, 30, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', true);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('series.created-with-link.published', 1, 40, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', true);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('media.published', 1, 50, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', true);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('bug-report.confirmed', 1, 60, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', false);
--> statement-breakpoint
INSERT INTO public.trust_action_rules (action_code, trust_points, display_order, created_at, updated_at, counts_toward_trust) VALUES ('review.published', 1, 70, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00', false);
--> statement-breakpoint
INSERT INTO public.trust_settings (id, minimum_level, minimum_trust_points, minimum_approval_rate_percent, minimum_history_days, auto_promotion_enabled, updated_by_admin_id, created_at, updated_at) VALUES (1, 5, 5, 90, 14, true, NULL, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('rating.created', 1, 10, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('series.link-existing.published', 2, 20, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('series.link-removal.published', 2, 30, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('series.created-with-link.published', 4, 40, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('media.published', 5, 50, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('bug-report.confirmed', 5, 60, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
INSERT INTO public.xp_action_rules (action_code, xp, display_order, created_at, updated_at) VALUES ('review.published', 10, 70, '2026-11-04 16:49:55.93489+00', '2026-11-04 16:49:55.93489+00');
--> statement-breakpoint
SELECT pg_catalog.setval('public.achievement_levels_id_seq', 6, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.achievements_id_seq', 6, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.author_access_profiles_id_seq', 3, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.creator_roles_id_seq', 15, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.creator_types_id_seq', 4, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.genres_id_seq', 53, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.jobs_id_seq', 14, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.media_carriers_id_seq', 21, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.media_types_id_seq', 9, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.platforms_id_seq', 102, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.provider_genre_exclusions_id_seq', 2, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.provider_genre_mappings_id_seq', 106, true);
--> statement-breakpoint
SELECT pg_catalog.setval('public.provider_platform_mappings_id_seq', 212, true);
