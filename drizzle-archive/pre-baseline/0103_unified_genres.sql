CREATE TABLE "genres" (
 "id" serial PRIMARY KEY, "slug" text NOT NULL UNIQUE, "name" text NOT NULL,
 "is_active" boolean DEFAULT true NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "genres_slug_check" CHECK (btrim(slug) <> ''), CONSTRAINT "genres_name_check" CHECK (btrim(name) <> '')
);
--> statement-breakpoint
CREATE TABLE "media_item_genres" (
 "media_item_id" integer NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 "genre_id" integer NOT NULL REFERENCES genres(id) ON DELETE RESTRICT,
 "provider" text, "is_manual" boolean DEFAULT false NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 PRIMARY KEY (media_item_id, genre_id),
 CONSTRAINT "media_item_genres_source_check" CHECK (provider IS NOT NULL OR is_manual),
 CONSTRAINT "media_item_genres_provider_check" CHECK (provider IS NULL OR btrim(provider) <> '')
);
--> statement-breakpoint
CREATE INDEX "media_item_genres_genre_id_idx" ON media_item_genres (genre_id);
--> statement-breakpoint
CREATE TABLE "provider_genre_mappings" (
 "id" serial PRIMARY KEY, "provider" text NOT NULL,
 "media_type" text NOT NULL REFERENCES media_types(code),
 "external_genre_id" text, "external_genre_name" text NOT NULL, "normalized_external_genre_name" text NOT NULL,
 "genre_id" integer NOT NULL REFERENCES genres(id) ON DELETE RESTRICT,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "provider_genre_mappings_provider_check" CHECK (btrim(provider) <> ''),
 CONSTRAINT "provider_genre_mappings_name_check" CHECK (btrim(external_genre_name) <> ''),
 CONSTRAINT "provider_genre_mappings_normalized_name_check" CHECK (btrim(normalized_external_genre_name) <> ''),
 CONSTRAINT "provider_genre_mappings_external_id_check" CHECK (external_genre_id IS NULL OR btrim(external_genre_id) <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_mappings_name_unique_idx" ON provider_genre_mappings (provider, media_type, normalized_external_genre_name, genre_id);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_genre_mappings_id_unique_idx" ON provider_genre_mappings (provider, media_type, external_genre_id, genre_id) WHERE external_genre_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO genres(slug, name) VALUES
('action', 'Боевик'),
('comedy', 'Комедия'),
('adventure', 'Приключения'),
('drama', 'Драма'),
('thriller', 'Триллер'),
('sci-fi', 'Фантастика'),
('horror', 'Ужасы'),
('fantasy', 'Фэнтези'),
('family', 'Семейный'),
('crime', 'Криминал'),
('melodrama', 'Мелодрама'),
('animation', 'Мультфильм'),
('detective', 'Детектив'),
('historical', 'Исторический'),
('war', 'Военный'),
('western', 'Вестерн'),
('music', 'Музыка'),
('documentary', 'Документальный'),
('children', 'Детский'),
('politics', 'Политика'),
('soap-opera', 'Мыльная опера'),
('romance', 'Романтика'),
('supernatural', 'Сверхъестественное'),
('psychological', 'Психологический'),
('slice-of-life', 'Повседневность'),
('mecha', 'Меха'),
('ecchi', 'Этти'),
('hentai', 'Хентай'),
('sports', 'Спорт'),
('game-adventure', 'Adventure'),
('game-action', 'Action'),
('game-hack-and-slash', 'Hack and slash/Beat ''em up'),
('game-card-board', 'Card & Board Game'),
('game-card', 'Card'),
('game-indie', 'Инди'),
('game-shooter', 'Шутер'),
('game-puzzle', 'Головоломка'),
('game-rpg', 'RPG'),
('game-platform', 'Платформер'),
('game-strategy', 'Стратегия'),
('game-simulator', 'Симулятор'),
('game-arcade', 'Аркада'),
('game-point-and-click', 'Point-and-click'),
('game-rts', 'RTS'),
('game-racing', 'Гонки'),
('game-tactical', 'Тактика'),
('game-tbs', 'Пошаговая стратегия'),
('game-fighting', 'Файтинг'),
('game-sport', 'Спортивная игра'),
('game-music', 'Музыкальная игра'),
('game-visual-novel', 'Визуальная новелла'),
('game-moba', 'MOBA'),
('game-casual', 'Казуальная игра')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO provider_genre_mappings(provider, media_type, external_genre_name, normalized_external_genre_name, genre_id)
SELECT seed.provider, seed.media_type, seed.name,
 btrim(replace(lower(regexp_replace(btrim(seed.name), '\s+', ' ', 'g')), 'ё', 'е')), genres.id
FROM (VALUES
('tmdb', 'film', 'боевик', 'action'),
('tmdb', 'film', 'комедия', 'comedy'),
('tmdb', 'film', 'приключения', 'adventure'),
('tmdb', 'film', 'драма', 'drama'),
('tmdb', 'film', 'триллер', 'thriller'),
('tmdb', 'film', 'фантастика', 'sci-fi'),
('tmdb', 'film', 'ужасы', 'horror'),
('tmdb', 'film', 'фэнтези', 'fantasy'),
('tmdb', 'film', 'семейный', 'family'),
('tmdb', 'film', 'криминал', 'crime'),
('tmdb', 'film', 'мелодрама', 'melodrama'),
('tmdb', 'film', 'мультфильм', 'animation'),
('tmdb', 'film', 'детектив', 'detective'),
('tmdb', 'film', 'история', 'historical'),
('tmdb', 'film', 'военный', 'war'),
('tmdb', 'film', 'вестерн', 'western'),
('tmdb', 'film', 'музыка', 'music'),
('tmdb', 'film', 'документальный', 'documentary'),
('tmdb', 'series', 'комедия', 'comedy'),
('tmdb', 'series', 'драма', 'drama'),
('tmdb', 'series', 'семейный', 'family'),
('tmdb', 'series', 'криминал', 'crime'),
('tmdb', 'series', 'мультфильм', 'animation'),
('tmdb', 'series', 'детектив', 'detective'),
('tmdb', 'series', 'вестерн', 'western'),
('tmdb', 'series', 'документальный', 'documentary'),
('tmdb', 'series', 'детский', 'children'),
('tmdb', 'series', 'мыльная опера', 'soap-opera'),
('tmdb', 'series', 'НФ и Фэнтези', 'sci-fi'),
('tmdb', 'series', 'НФ и Фэнтези', 'fantasy'),
('tmdb', 'series', 'Боевик и Приключения', 'action'),
('tmdb', 'series', 'Боевик и Приключения', 'adventure'),
('tmdb', 'series', 'Война и Политика', 'war'),
('tmdb', 'series', 'Война и Политика', 'politics'),
('tmdb', 'series', 'Animation', 'animation'),
('anilist', 'anime', 'Action', 'action'),
('anilist', 'anime', 'Drama', 'drama'),
('anilist', 'anime', 'Sci-Fi', 'sci-fi'),
('anilist', 'anime', 'Adventure', 'adventure'),
('anilist', 'anime', 'Comedy', 'comedy'),
('anilist', 'anime', 'Fantasy', 'fantasy'),
('anilist', 'anime', 'Romance', 'romance'),
('anilist', 'anime', 'Supernatural', 'supernatural'),
('anilist', 'anime', 'Psychological', 'psychological'),
('anilist', 'anime', 'Horror', 'horror'),
('anilist', 'anime', 'Slice of Life', 'slice-of-life'),
('anilist', 'anime', 'Mecha', 'mecha'),
('anilist', 'anime', 'Mystery', 'detective'),
('anilist', 'anime', 'Ecchi', 'ecchi'),
('anilist', 'anime', 'Thriller', 'thriller'),
('anilist', 'anime', 'Hentai', 'hentai'),
('anilist', 'anime', 'Sports', 'sports'),
('anilist', 'anime', 'Music', 'music'),
('igdb', 'game', 'Adventure', 'game-adventure'),
('igdb', 'game', 'Hack and slash/Beat ''em up', 'game-hack-and-slash'),
('igdb', 'game', 'Card & Board Game', 'game-card-board'),
('igdb', 'game', 'Indie', 'game-indie'),
('igdb', 'game', 'Shooter', 'game-shooter'),
('igdb', 'game', 'Puzzle', 'game-puzzle'),
('igdb', 'game', 'Role-playing (RPG)', 'game-rpg'),
('igdb', 'game', 'Platform', 'game-platform'),
('igdb', 'game', 'Strategy', 'game-strategy'),
('igdb', 'game', 'Simulator', 'game-simulator'),
('igdb', 'game', 'Arcade', 'game-arcade'),
('igdb', 'game', 'Point-and-click', 'game-point-and-click'),
('igdb', 'game', 'Real Time Strategy (RTS)', 'game-rts'),
('igdb', 'game', 'Racing', 'game-racing'),
('igdb', 'game', 'Tactical', 'game-tactical'),
('igdb', 'game', 'Turn-based strategy (TBS)', 'game-tbs'),
('igdb', 'game', 'Fighting', 'game-fighting'),
('igdb', 'game', 'Sport', 'game-sport'),
('igdb', 'game', 'Music', 'game-music'),
('igdb', 'game', 'Visual Novel', 'game-visual-novel'),
('igdb', 'game', 'MOBA', 'game-moba'),
('rawg', 'game', 'Adventure', 'game-adventure'),
('rawg', 'game', 'Action', 'game-action'),
('rawg', 'game', 'Card', 'game-card'),
('rawg', 'game', 'Indie', 'game-indie'),
('rawg', 'game', 'Shooter', 'game-shooter'),
('rawg', 'game', 'Puzzle', 'game-puzzle'),
('rawg', 'game', 'Strategy', 'game-strategy'),
('rawg', 'game', 'Arcade', 'game-arcade'),
('rawg', 'game', 'Racing', 'game-racing'),
('rawg', 'game', 'Fighting', 'game-fighting'),
('rawg', 'game', 'Casual', 'game-casual'),
('rawg', 'game', 'RPG', 'game-rpg'),
('rawg', 'game', 'Platformer', 'game-platform'),
('rawg', 'game', 'Simulation', 'game-simulator'),
('rawg', 'game', 'Sports', 'game-sport')) AS seed(provider, media_type, name, slug)
JOIN genres ON genres.slug = seed.slug
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- TMDB anime uses the same TV endpoint and genre vocabulary as series.
INSERT INTO provider_genre_mappings(provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id)
SELECT provider, 'anime', external_genre_id, external_genre_name, normalized_external_genre_name, genre_id
FROM provider_genre_mappings WHERE provider = 'tmdb' AND media_type = 'series'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Mirrors normalizeGenreNameSql, which wraps the shared normalizeSearchSql.
-- Strings are whole genre names: no historical delimiter has been verified.
CREATE TEMP TABLE unified_genre_backfill ON COMMIT DROP AS
SELECT m.media_item_id, i.media_type,
 coalesce(nullif(btrim(m.source_provider), ''), CASE WHEN s.media_type = i.media_type
 AND s.facts->'genres' = m.facts->'genres' THEN s.provider_code END) AS provider,
 value.raw, jsonb_typeof(value.raw) AS raw_type,
 CASE WHEN jsonb_typeof(value.raw) = 'string' THEN
 btrim(replace(lower(regexp_replace(btrim(value.raw #>> '{}'), '\s+', ' ', 'g')), 'ё', 'е')) END AS normalized_name
FROM media_item_metadata m
JOIN media_items i ON i.id = m.media_item_id
LEFT JOIN media_item_provider_snapshots s ON s.media_item_id = m.media_item_id
CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(m.facts->'genres')
 WHEN 'array' THEN m.facts->'genres'
 WHEN 'string' THEN jsonb_build_array(m.facts->'genres')
 WHEN 'null' THEN '[]'::jsonb
 ELSE CASE WHEN m.facts ? 'genres' THEN jsonb_build_array(m.facts->'genres') ELSE '[]'::jsonb END
 END) AS value(raw);
--> statement-breakpoint
INSERT INTO media_item_genres(media_item_id, genre_id, provider)
SELECT DISTINCT b.media_item_id, p.genre_id, b.provider
FROM unified_genre_backfill b
JOIN provider_genre_mappings p ON p.provider = b.provider AND p.media_type = b.media_type
 AND p.normalized_external_genre_name = b.normalized_name
JOIN genres g ON g.id = p.genre_id AND g.is_active
ON CONFLICT (media_item_id, genre_id) DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE diagnostic record; excluded_count integer; links_count integer;
BEGIN
 FOR diagnostic IN
  SELECT b.provider, b.media_type, b.normalized_name, b.raw_type,
   CASE WHEN b.raw_type <> 'string' THEN 'invalid genre element'
    WHEN b.provider IS NULL THEN 'unknown provider' ELSE 'unmapped genre' END AS reason,
   count(DISTINCT b.media_item_id) AS records,
   (array_agg(DISTINCT b.media_item_id))[1:10] AS example_ids
  FROM unified_genre_backfill b
  WHERE (b.raw_type <> 'string' OR b.normalized_name <> '')
   AND NOT (b.provider IS NOT DISTINCT FROM 'tmdb' AND b.media_type = 'film'
    AND coalesce(b.normalized_name, '') IN ('телевизионный фильм', 'tv movie'))
   AND NOT EXISTS (SELECT 1 FROM provider_genre_mappings p
    WHERE p.provider = b.provider AND p.media_type = b.media_type
     AND p.normalized_external_genre_name = b.normalized_name)
  GROUP BY b.provider, b.media_type, b.normalized_name, b.raw_type
 LOOP
  RAISE WARNING 'Genre backfill: %, provider=%, type=%, genre=%, raw_type=%, records=%, example_ids=%',
   diagnostic.reason, diagnostic.provider, diagnostic.media_type, diagnostic.normalized_name,
   diagnostic.raw_type, diagnostic.records, diagnostic.example_ids;
 END LOOP;
 SELECT count(DISTINCT media_item_id) INTO excluded_count FROM unified_genre_backfill
 WHERE provider = 'tmdb' AND media_type = 'film' AND normalized_name IN ('телевизионный фильм', 'tv movie');
 SELECT count(*) INTO links_count FROM media_item_genres;
 RAISE NOTICE 'Genre backfill complete: % normalized links; % records with intentionally excluded TV Movie', links_count, excluded_count;
END $$;
