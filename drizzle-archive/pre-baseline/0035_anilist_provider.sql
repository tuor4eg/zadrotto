INSERT INTO "provider_settings" ("media_type", "provider_code", "enabled", "priority")
VALUES
  ('anime', 'anilist', true, 20),
  ('anime', 'tmdb', true, 30)
ON CONFLICT ("media_type", "provider_code") DO NOTHING;

INSERT INTO "provider_rate_limits" ("provider_code", "searches_per_day")
VALUES ('anilist', 1000)
ON CONFLICT ("provider_code") DO NOTHING;
