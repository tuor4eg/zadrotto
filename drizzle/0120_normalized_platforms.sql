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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "platforms_slug_check" CHECK (btrim("platforms"."slug") <> ''),
	CONSTRAINT "platforms_name_check" CHECK (btrim("platforms"."name") <> '')
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_platform_mappings_game_check" CHECK ("provider_platform_mappings"."media_type" = 'game'),
	CONSTRAINT "provider_platform_mappings_provider_check" CHECK (btrim("provider_platform_mappings"."provider") <> ''),
	CONSTRAINT "provider_platform_mappings_name_check" CHECK (btrim("provider_platform_mappings"."external_platform_name") <> ''),
	CONSTRAINT "provider_platform_mappings_normalized_name_check" CHECK (btrim("provider_platform_mappings"."normalized_external_platform_name") <> '')
);
--> statement-breakpoint
ALTER TABLE "media_item_platforms" ADD CONSTRAINT "media_item_platforms_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_platforms" ADD CONSTRAINT "media_item_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_request_media_items" ADD CONSTRAINT "platform_request_media_items_request_id_platform_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."platform_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_request_media_items" ADD CONSTRAINT "platform_request_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_exclusions" ADD CONSTRAINT "provider_platform_exclusions_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_mappings" ADD CONSTRAINT "provider_platform_mappings_media_type_media_types_code_fk" FOREIGN KEY ("media_type") REFERENCES "public"."media_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_platform_mappings" ADD CONSTRAINT "provider_platform_mappings_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_item_platforms_platform_id_idx" ON "media_item_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "platform_request_media_items_item_idx" ON "platform_request_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_requests_key_unique_idx" ON "platform_requests" USING btree ("provider","media_type","normalized_external_platform_name");--> statement-breakpoint
CREATE INDEX "platform_requests_pending_idx" ON "platform_requests" USING btree ("first_seen_at","id") WHERE "platform_requests"."decision" is null;--> statement-breakpoint
CREATE INDEX "platform_requests_job_run_id_idx" ON "platform_requests" USING btree ("job_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_platform_exclusions_key_unique_idx" ON "provider_platform_exclusions" USING btree ("provider","media_type","normalized_external_platform_name");--> statement-breakpoint
CREATE INDEX "provider_platform_mappings_platform_id_idx" ON "provider_platform_mappings" USING btree ("platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_platform_mappings_name_unique_idx" ON "provider_platform_mappings" USING btree ("provider","media_type","normalized_external_platform_name","platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_platform_request_apply_active_unique" ON "job_runs" USING btree (("payload"->>'requestId')) WHERE "job_runs"."type" = 'media.platform-request-apply' and "job_runs"."status" in ('queued', 'running');