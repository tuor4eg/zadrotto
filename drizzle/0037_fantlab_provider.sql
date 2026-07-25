INSERT INTO "provider_settings" ("media_type", "provider_code", "enabled", "priority")
VALUES ('book', 'fantlab', true, 30)
ON CONFLICT ("media_type", "provider_code") DO NOTHING;

INSERT INTO "provider_rate_limits" ("provider_code", "searches_per_day")
VALUES ('fantlab', 1000)
ON CONFLICT ("provider_code") DO NOTHING;
