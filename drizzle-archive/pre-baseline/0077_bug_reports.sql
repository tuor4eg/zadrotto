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
	CONSTRAINT "bug_reports_description_check" CHECK (char_length(btrim("description")) between 1 and 2000),
	CONSTRAINT "bug_reports_url_check" CHECK (char_length("url") between 1 and 2048 and left("url", 1) = '/' and left("url", 2) <> '//'),
	CONSTRAINT "bug_reports_entity_pair_check" CHECK (("entity_type" is null) = ("entity_id" is null)),
	CONSTRAINT "bug_reports_entity_type_check" CHECK ("entity_type" is null or "entity_type" in ('media-item', 'franchise', 'quiz')),
	CONSTRAINT "bug_reports_entity_id_check" CHECK ("entity_id" is null or btrim("entity_id") <> ''),
	CONSTRAINT "bug_reports_status_check" CHECK ("status" in ('new', 'reviewing', 'confirmed', 'fixed', 'rejected')),
	CONSTRAINT "bug_reports_confirmed_at_check" CHECK (("status" in ('confirmed', 'fixed')) = ("confirmed_at" is not null)),
	CONSTRAINT "bug_reports_resolution_check" CHECK ((("status" in ('fixed', 'rejected')) = ("resolved_at" is not null)) and ("status" in ('fixed', 'rejected') or "resolved_by_admin_id" is null))
);
--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bug_reports_status_created_at_idx" ON "bug_reports" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "bug_reports_author_confirmed_at_idx" ON "bug_reports" USING btree ("author_id","confirmed_at") WHERE "confirmed_at" is not null;
--> statement-breakpoint
ALTER TABLE "notification_transport_routes" DROP CONSTRAINT "notification_transport_routes_code_check";
--> statement-breakpoint
ALTER TABLE "notification_transport_routes" ADD CONSTRAINT "notification_transport_routes_code_check" CHECK ("code" in ('submission_created', 'bug_report_created'));
--> statement-breakpoint
INSERT INTO "notification_transport_routes" ("code", "transport_codes") VALUES ('bug_report_created', '[]'::jsonb) ON CONFLICT ("code") DO NOTHING;
