import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const baseline = readFileSync("drizzle/0000_baseline.sql", "utf8");
const snapshot = JSON.parse(readFileSync("drizzle/meta/0000_snapshot.json", "utf8"));

test("fresh migration chain contains one baseline and preserves historical migrations", () => {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  assert.deepEqual(journal.entries.map((entry: { tag: string }) => entry.tag), ["0000_baseline"]);
  assert.deepEqual(readdirSync("drizzle").filter(file => file.endsWith(".sql")), ["0000_baseline.sql"]);
  const historical = JSON.parse(readFileSync("drizzle-archive/pre-baseline/meta/_journal.json", "utf8"));
  assert.equal(historical.entries.length, 162);
  for (const entry of historical.entries) {
    assert.ok(readFileSync(`drizzle-archive/pre-baseline/${entry.tag}.sql`, "utf8").length > 0);
  }
});

test("baseline retains SQL behavior and executable literal checks", () => {
  assert.match(baseline, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.equal([...baseline.matchAll(/^CREATE FUNCTION /gm)].length, 8);
  assert.equal([...baseline.matchAll(/^CREATE (?:CONSTRAINT )?TRIGGER /gm)].length, 9);
  assert.doesNotMatch(baseline, /\$\d+|^\\(?:restrict|unrestrict)/m);
  for (const table of Object.values(snapshot.tables) as { checkConstraints: unknown }[]) {
    assert.doesNotMatch(JSON.stringify(table.checkConstraints), /\$\d+/);
  }
});

test("bootstrap seeds contain reference data without user accounts or archive content", () => {
  const tables = new Set([...baseline.matchAll(/^INSERT INTO public\.(\w+)/gm)].map(match => match[1]));
  assert.equal(tables.size, 29);
  for (const statement of baseline.matchAll(/^INSERT INTO public\.\w+.*$/gm)) {
    assert.match(statement[0], /^INSERT INTO public\.\w+ \([^)]+\) VALUES /);
  }
  for (const table of ["media_types", "provider_settings", "jobs", "achievements"]) assert.ok(tables.has(table));
  for (const table of ["authors", "admin_users", "media_items", "ratings", "provider_snapshots", "job_runs"]) {
    assert.ok(!tables.has(table), `bootstrap must not seed ${table}`);
  }
});
