import assert from "node:assert/strict";
import test from "node:test";
import { executeClaimedJobRun } from "../src/lib/jobs/worker";
import { JobError } from "../src/lib/jobs/types";

test("game companies backfill rejects scheduled and event invocation before accessing persistence", {skip: !process.env.NODE_PATH}, async () => {
  const {gameCompanyBackfillHandler}=await import("../src/lib/creators/game-company-backfill");
  assert.equal(gameCompanyBackfillHandler.schedulable, false);
  assert.deepEqual(gameCompanyBackfillHandler.parsePayload({}), {});
  for (const value of [null, [], { provider: "rawg" }, { backfillId: 1 }]) {
    assert.throws(() => gameCompanyBackfillHandler.parsePayload(value), { code: "invalid-payload" });
  }
  for (const context of [{ source: "schedule", jobId: 1 }, { source: "event", jobId: null }, { source: "manual", jobId: 1 }] as const) {
    await assert.rejects(gameCompanyBackfillHandler.execute({ ...context, payload: {}, attempt: 1, runId: 1, signal: new AbortController().signal }), { code: "manual-only", retryable: false });
  }
});

test("provider budget postponement releases the worker lease without retry or terminal completion", async () => {
  const deferred: Array<Record<string, unknown>> = [];
  await executeClaimedJobRun({
    getHandler: () => ({ type:"media.game-companies-backfill",label:"Test",parsePayload:()=>({}), execute: async () => { throw new JobError("provider-daily-limit", "Лимит исчерпан.", { deferSeconds: 3600 }); } }),
    operations: {
      finish: async () => { assert.fail("budget wait must not finish the run"); },
      requeue: async () => { assert.fail("budget wait must not spend a retry"); },
      defer: async input => { deferred.push(input); return null; },
    },
    run: { attempts: 1, id: 1, jobId: null, lockToken: "lease", maxAttempts: 3, payload: {}, source: "manual", timeoutSeconds: 300, type: "media.game-companies-backfill" } as never,
  });
  assert.equal(deferred.length, 1);
  assert.equal(deferred[0].delaySeconds, 3600);
  assert.equal(deferred[0].errorCode, "provider-daily-limit");
});
