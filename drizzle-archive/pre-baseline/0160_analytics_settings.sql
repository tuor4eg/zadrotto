CREATE TABLE "analytics_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  CONSTRAINT "analytics_settings_singleton_check" CHECK ("id" = 1)
);
