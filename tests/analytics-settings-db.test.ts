import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const databaseUrl = process.env.ANALYTICS_TEST_DATABASE_URL;
test("analytics defaults off, persists toggles and enforces a singleton", { skip: !databaseUrl }, async () => {
  const { default: postgres } = await import("postgres");
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const schema = `analytics_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(await readFile(new URL("../drizzle-archive/pre-baseline/0160_analytics_settings.sql", import.meta.url), "utf8"));
    const { getAnalyticsSettings, saveAnalyticsSettings } = await import("../src/db/queries/analytics-settings");
    assert.deepEqual(await getAnalyticsSettings(), { enabled: false });
    await saveAnalyticsSettings(true);
    assert.deepEqual(await getAnalyticsSettings(), { enabled: true });
    await saveAnalyticsSettings(false);
    assert.deepEqual(await getAnalyticsSettings(), { enabled: false });
    assert.equal((await client`select * from analytics_settings`).length, 1);
    await client`delete from analytics_settings`;
    await client`insert into analytics_settings(id) values(1)`;
    assert.equal((await client`select enabled from analytics_settings`)[0].enabled, false);
    await assert.rejects(client`insert into analytics_settings(id) values(2)`, /singleton_check/);
  } finally {
    await client.end({ timeout: 1 });
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end({ timeout: 1 });
  }
});
