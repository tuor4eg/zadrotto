ALTER TABLE "genres" ADD COLUMN "replacement_franchise_id" integer;
--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_replacement_franchise_id_franchises_id_fk" FOREIGN KEY ("replacement_franchise_id") REFERENCES "public"."franchises"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "genres_replacement_franchise_id_idx" ON "genres" USING btree ("replacement_franchise_id");
