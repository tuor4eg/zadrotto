CREATE TABLE "media_carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_carriers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "media_carrier_id" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_media_carrier_id_media_carriers_id_fk" FOREIGN KEY ("media_carrier_id") REFERENCES "public"."media_carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_carriers_media_type_idx" ON "media_carriers" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "media_items_media_carrier_id_idx" ON "media_items" USING btree ("media_carrier_id");
