CREATE INDEX "media_items_media_type_idx" ON "media_items" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "media_items_release_year_idx" ON "media_items" USING btree ("release_year");--> statement-breakpoint
CREATE INDEX "media_items_title_idx" ON "media_items" USING btree ("title");