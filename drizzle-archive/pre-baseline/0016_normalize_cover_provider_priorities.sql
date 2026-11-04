UPDATE "cover_provider_settings"
SET "priority" = CASE
  WHEN "media_type" = 'film' AND "provider_code" = 'tmdb' THEN 10
  WHEN "media_type" = 'series' AND "provider_code" = 'tmdb' THEN 10
  WHEN "media_type" = 'book' AND "provider_code" = 'open-library' THEN 10
  WHEN "media_type" = 'book' AND "provider_code" = 'google-books' THEN 20
  WHEN "media_type" = 'game' AND "provider_code" = 'igdb' THEN 10
  WHEN "media_type" = 'game' AND "provider_code" = 'rawg' THEN 20
  WHEN "media_type" = 'anime' AND "provider_code" = 'jikan' THEN 10
  ELSE "priority"
END,
"updated_at" = now()
WHERE ("media_type", "provider_code") IN (
  ('film', 'tmdb'),
  ('series', 'tmdb'),
  ('book', 'open-library'),
  ('book', 'google-books'),
  ('game', 'igdb'),
  ('game', 'rawg'),
  ('anime', 'jikan')
);
