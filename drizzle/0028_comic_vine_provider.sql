INSERT INTO "provider_settings" ("media_type", "provider_code", "enabled", "priority")
VALUES
  ('comic', 'comic-vine', true, 10)
ON CONFLICT ("media_type", "provider_code") DO NOTHING;
