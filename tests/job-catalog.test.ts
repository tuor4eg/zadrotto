import assert from "node:assert/strict";
import test from "node:test";
import { assertJobManualPlacement, getJobManualPlacement, getMigrationDefinition } from "../src/lib/jobs/catalog";

test("manual job catalog denies unknown and internal handlers by default", () => {
  assert.equal(getJobManualPlacement("future.internal-handler"), "none");
  assert.equal(getJobManualPlacement("media.creator-request-apply"), "none");
  assert.equal(getJobManualPlacement("reputation.initialize"), "domain");
  assert.throws(() => assertJobManualPlacement("reputation.initialize", "general"));
  assert.throws(() => assertJobManualPlacement("media.tmdb-directors-backfill", "general"));
});

test("completed migrations are no longer launchable while repeatable operations remain", () => {
  assert.doesNotThrow(() => assertJobManualPlacement("media.creator-images-backfill", "general"));
  assert.throws(() => assertJobManualPlacement("media.tmdb-directors-backfill", "migration"));
  assert.equal(getMigrationDefinition("media.tmdb-directors-backfill"), null);
  assert.equal(getMigrationDefinition("future.internal-handler"), null);
  for (const type of ["media.tmdb-person-avatar", "media.creator-fantlab-avatars", "media.tmdb-company-logos"]) {
    assert.equal(getJobManualPlacement(type), "none");
  }
});
