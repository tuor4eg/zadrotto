CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "media_items_title_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_items_original_title_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("original_title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_items_code_search_idx" ON "media_items" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_item_title_aliases_value_search_idx" ON "media_item_title_aliases" USING gin (replace(lower(regexp_replace(btrim(coalesce("value", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "franchises_title_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "franchises_original_title_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("original_title", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "franchises_code_search_idx" ON "franchises" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_carriers_name_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("name", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_carriers_description_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("description", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "media_carriers_code_search_idx" ON "media_carriers" USING gin (replace(lower(regexp_replace(btrim(coalesce("code", '')), '\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops);
