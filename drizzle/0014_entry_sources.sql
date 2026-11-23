CREATE TABLE "entry_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"creator_id" integer,
	"source_entry_id" integer,
	"source_series_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_sources_one_target_check" CHECK (num_nonnulls("entry_sources"."creator_id", "entry_sources"."source_entry_id", "entry_sources"."source_series_id") = 1),
	CONSTRAINT "entry_sources_no_self_link_check" CHECK ("entry_sources"."entry_id" <> "entry_sources"."source_entry_id")
);
--> statement-breakpoint
ALTER TABLE "entry_sources" ADD CONSTRAINT "entry_sources_entry_id_media_items_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_sources" ADD CONSTRAINT "entry_sources_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_sources" ADD CONSTRAINT "entry_sources_source_entry_id_media_items_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_sources" ADD CONSTRAINT "entry_sources_source_series_id_franchises_id_fk" FOREIGN KEY ("source_series_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_sources_entry_idx" ON "entry_sources" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_sources_creator_entry_idx" ON "entry_sources" USING btree ("creator_id","entry_id") WHERE "entry_sources"."creator_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_sources_source_entry_idx" ON "entry_sources" USING btree ("source_entry_id","entry_id") WHERE "entry_sources"."source_entry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_sources_series_entry_idx" ON "entry_sources" USING btree ("source_series_id","entry_id") WHERE "entry_sources"."source_series_id" is not null;