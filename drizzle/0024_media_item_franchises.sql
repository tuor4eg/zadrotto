CREATE TABLE "media_item_franchises" (
	"media_item_id" integer NOT NULL,
	"franchise_id" integer NOT NULL,
	CONSTRAINT "media_item_franchises_pk" PRIMARY KEY("media_item_id","franchise_id")
);
--> statement-breakpoint
INSERT INTO "media_item_franchises" ("media_item_id", "franchise_id")
SELECT "id", "franchise_id"
FROM "media_items"
WHERE "franchise_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "media_item_franchises" ADD CONSTRAINT "media_item_franchises_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_item_franchises" ADD CONSTRAINT "media_item_franchises_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "media_item_franchises_franchise_id_idx" ON "media_item_franchises" USING btree ("franchise_id");
--> statement-breakpoint
DROP INDEX "public"."media_items_franchise_id_idx";
--> statement-breakpoint
ALTER TABLE "media_items" DROP CONSTRAINT "media_items_franchise_id_franchises_id_fk";
--> statement-breakpoint
ALTER TABLE "media_items" DROP COLUMN "franchise_id";
