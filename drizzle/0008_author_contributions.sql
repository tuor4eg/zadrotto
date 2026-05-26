CREATE TYPE "public"."contribution_status" AS ENUM('draft', 'submitted', 'published', 'rejected', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('review');--> statement-breakpoint
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
	"status" "contribution_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_admin_id" integer,
	"reviewed_at" timestamp with time zone,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution_media_items" ADD CONSTRAINT "contribution_media_items_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_media_items" ADD CONSTRAINT "contribution_media_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_primary_media_item_id_media_items_id_fk" FOREIGN KEY ("primary_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_media_items_media_item_id_idx" ON "contribution_media_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "contributions_status_submitted_at_idx" ON "contributions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "contributions_author_id_updated_at_idx" ON "contributions" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "contributions_primary_media_item_id_idx" ON "contributions" USING btree ("primary_media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_review_author_media_unique" ON "contributions" USING btree ("author_id","primary_media_item_id") WHERE "contributions"."type" = 'review';