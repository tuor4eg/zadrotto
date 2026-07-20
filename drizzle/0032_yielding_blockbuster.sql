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
	CONSTRAINT "author_auth_identities_provider_subject_unique" UNIQUE("provider","provider_subject")
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
CREATE TABLE "author_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"auth_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	CONSTRAINT "author_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "author_sessions_auth_method_check" CHECK ("author_sessions"."auth_method" in ('password', 'access_token', 'telegram'))
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"encrypted_payload" text NOT NULL,
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
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_approved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_accounts" ADD CONSTRAINT "author_accounts_rejected_by_admin_id_admin_users_id_fk" FOREIGN KEY ("rejected_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_emails" ADD CONSTRAINT "author_emails_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_identities" ADD CONSTRAINT "author_auth_identities_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_challenges" ADD CONSTRAINT "author_auth_challenges_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_auth_challenges" ADD CONSTRAINT "author_auth_challenges_email_id_author_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."author_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_sessions" ADD CONSTRAINT "author_sessions_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "author_emails_author_id_idx" ON "author_emails" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "author_emails_primary_author_idx" ON "author_emails" USING btree ("author_id") WHERE "author_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "author_auth_identities_author_id_idx" ON "author_auth_identities" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_author_id_idx" ON "author_auth_challenges" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_purpose_idx" ON "author_auth_challenges" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_token_hash_idx" ON "author_auth_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "author_auth_challenges_expires_at_idx" ON "author_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "author_sessions_author_id_idx" ON "author_sessions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "author_sessions_expires_at_idx" ON "author_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_outbox_delivery_idx" ON "email_outbox" USING btree ("status","next_attempt_at");
