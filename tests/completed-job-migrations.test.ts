import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getJobManualPlacement, JOB_MIGRATIONS } from "../src/lib/jobs/catalog";
import { getRetiredJob } from "../src/lib/jobs/retired";

const completed = ["media.tmdb-companies-backfill", "media.tmdb-directors-backfill", "media.bgg-creators-backfill", "media.game-companies-backfill", "media.creator-fantlab-bindings", "media.creators-backfill", "media.genre-series-backfill"];
test("completed production transfers no longer appear as migrations or allow new runs", () => {
  assert.deepEqual(Object.keys(JOB_MIGRATIONS), []);
  for (const type of completed) {
    assert.equal(getJobManualPlacement(type), "none");
    assert.ok(getRetiredJob(type)?.reason.includes("завершён"));
  }
});
test("schema cleanup refuses unfinished work and drops only disposable checkpoint storage", () => {
  const migration = readFileSync("drizzle/0139_retire_completed_job_migrations.sql", "utf8");
  assert.match(migration, /status IN \('queued','running'\)/);
  for (const type of completed) assert.ok(migration.includes(`'${type}'`));
  assert.match(migration, /status IN \('pending','ready','error'\)/);
  assert.ok(migration.indexOf("RAISE EXCEPTION") < migration.indexOf("DROP TABLE"));
  assert.deepEqual([...migration.matchAll(/DROP TABLE (\w+)/g)].map(m => m[1]), ["game_company_backfill_items", "game_company_backfills"]);
  assert.doesNotMatch(migration, /\b(?:DELETE FROM|TRUNCATE)\b/i);
  const schema = readFileSync("src/db/schema.ts", "utf8");
  assert.doesNotMatch(schema, /export const gameCompanyBackfills|export const gameCompanyBackfillItems|job_runs_game_company_backfill_active_unique/);
});
