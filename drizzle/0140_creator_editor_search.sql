CREATE INDEX creators_name_search_idx ON creators USING gin ((replace(lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g')), 'ё', 'е')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX creators_original_name_search_idx ON creators USING gin ((replace(lower(regexp_replace(btrim(coalesce(original_name, '')), '\s+', ' ', 'g')), 'ё', 'е')) gin_trgm_ops);
