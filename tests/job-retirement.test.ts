import assert from "node:assert/strict";
import { test } from "node:test";
import { createJobHandlerRegistry } from "../src/lib/jobs/registry";
import { getRetiredJob, RETIRED_JOB_TYPES } from "../src/lib/jobs/retired";
import { JobError } from "../src/lib/jobs/types";
import { getJobManualPlacement } from "../src/lib/jobs/catalog";

test("retired image tasks retain history labels but cannot execute or enter a menu", () => {
  const registry = createJobHandlerRegistry(RETIRED_JOB_TYPES.map(type => ({ type, label: type, parsePayload: value => value, execute: async () => assert.fail("retired code must not run") })));
  assert.equal(registry.list().length, 0);
  for (const type of RETIRED_JOB_TYPES) {
    assert.ok(getRetiredJob(type)?.reason);
    assert.equal(getJobManualPlacement(type), "none");
    assert.throws(() => registry.get(type), (error: unknown) => error instanceof JobError && error.code === "job-type-retired" && error.retryable === false);
  }
  assert.equal(getRetiredJob("toString"), undefined);
});
