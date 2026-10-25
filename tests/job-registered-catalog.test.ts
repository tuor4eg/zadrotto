import assert from "node:assert/strict";
import { test } from "node:test";
import { RETIRED_JOB_TYPES } from "../src/lib/jobs/retired";

test("live registry keeps fourteen periodic types and exposes only valid general operations", async () => {
  const { jobHandlerRegistry } = await import("../src/lib/jobs/handlers");
  const handlers = jobHandlerRegistry.list();
  assert.equal(handlers.filter(h => h.schedulable !== false).length, 14);
  assert.equal(handlers.filter(h => h.manualPlacement === "migration").length, 0);
  for (const handler of handlers.filter(h => h.manualPlacement === "general")) assert.doesNotThrow(() => handler.parsePayload({}), handler.type);
  for (const type of RETIRED_JOB_TYPES) assert.ok(!handlers.some(h => h.type === type));
  assert.equal(jobHandlerRegistry.get("media.creator-name-localization").manualPlacement, "general");
  assert.equal(jobHandlerRegistry.get("media.creator-image-refresh").manualPlacement, "domain");
  assert.equal(jobHandlerRegistry.get("media.genre-series-apply").manualPlacement, "domain");
  assert.equal(jobHandlerRegistry.get("reputation.initialize").manualPlacement, "domain");
  assert.throws(() => jobHandlerRegistry.get("reputation.initialize").parsePayload({}));
});
