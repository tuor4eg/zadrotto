import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getMigrationDefinition, getJobManualPlacement } from "../src/lib/jobs/catalog";

test("review length migration uses the existing parameter-free restart form", () => {
  const type = "reviews.body-length-backfill";
  assert.equal(getMigrationDefinition(type)?.form, "empty");
  assert.equal(getJobManualPlacement(type), "migration");
  assert.equal(getMigrationDefinition("media.tmdb-directors-backfill"), null);
  const form = readFileSync("src/app/admin/(protected)/tools/jobs/migrations/migration-form.tsx", "utf8");
  assert.match(form, /definition\.form !== "empty"/);
  assert.match(form, /name="payload" value=\{JSON\.stringify\(payload\)\}/);
  assert.match(form, /Параметры не требуются/);
});
