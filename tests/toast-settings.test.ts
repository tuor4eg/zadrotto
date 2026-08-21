import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0073_toast_settings.sql", "utf8");
const nav = readFileSync("src/app/admin/(protected)/settings/settings-nav.tsx", "utf8");
const page = readFileSync("src/app/admin/(protected)/settings/notifications/page.tsx", "utf8");
const toasts = readFileSync("src/components/ui/archive-toasts.tsx", "utf8");
const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
const provider = readFileSync("src/components/ui/toast-settings-provider.tsx", "utf8");

test("toast durations are persisted with safe database bounds", () => {
  assert.match(schema, /export const toastSettings = pgTable/);
  assert.match(migration, /site_duration_seconds.*DEFAULT 5 NOT NULL/);
  assert.match(migration, /site_duration_seconds.*between 1 and 60/);
  assert.match(migration, /admin_duration_seconds.*between 1 and 60/);
});

test("notification settings are available in admin navigation", () => {
  assert.match(nav, /\/admin\/settings\/notifications/);
  assert.match(nav, /Уведомления/);
  assert.match(page, /siteDurationSeconds/);
  assert.match(page, /adminDurationSeconds/);
});

test("shared toasts select duration for site and admin routes", () => {
  assert.match(toasts, /pathname\.startsWith\("\/admin\/"\)/);
  assert.match(toasts, /adminDurationSeconds/);
  assert.match(toasts, /siteDurationSeconds/);
  assert.match(toasts, /durationSeconds \* 1000/);
});

test("toast settings are loaded at runtime without making static pages query the database", () => {
  assert.doesNotMatch(rootLayout, /getToastSettings/);
  assert.match(provider, /fetch\("\/api\/toast-settings"/);
  assert.match(provider, /DEFAULT_TOAST_SETTINGS/);
});
