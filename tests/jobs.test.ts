import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getNextJobRunAt, validateJobCronExpression } from "../src/lib/jobs/cron";
import { calculateJobRetryDelaySeconds } from "../src/lib/jobs/model";
import { createJobHandlerRegistry } from "../src/lib/jobs/registry";
import { executeClaimedJobRun } from "../src/lib/jobs/worker";

const handler = { defaultMaxAttempts: 1, defaultRetryBaseSeconds: 1, defaultRetryMaxSeconds: 1, defaultTimeoutSeconds: 1, execute: async () => {}, label: "Тест", parsePayload: (value: unknown) => value, type: "test.job" };

test("cron accepts five parts and produces a future UTC occurrence", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(validateJobCronExpression("*/5 * * * *"), "*/5 * * * *");
  assert.equal(getNextJobRunAt("*/5 * * * *", now).toISOString(), "2026-01-01T00:05:00.000Z");
});

test("cron rejects non-five-part expressions", () => {
  assert.throws(() => validateJobCronExpression("0 3 * * * *"));
});

test("registry rejects duplicate types", () => {
  assert.throws(() => createJobHandlerRegistry([handler, handler]));
});

test("retry delay grows exponentially and is capped", () => {
  assert.equal(calculateJobRetryDelaySeconds({ attempts: 1, baseSeconds: 10, maxSeconds: 100 }), 10);
  assert.equal(calculateJobRetryDelaySeconds({ attempts: 5, baseSeconds: 10, maxSeconds: 100 }), 100);
});

test("invalid payload fails terminally without requeue", async () => {
  const completions: Array<Record<string, unknown>> = [];
  let requeues = 0;
  await executeClaimedJobRun({
    getHandler: () => ({ ...handler, parsePayload: () => { throw new Error("bad payload"); } }),
    operations: {
      finish: async (input) => { completions.push(input); return null; },
      requeue: async () => { requeues += 1; return null; },
    },
    run: { attempts: 1, id: 10, jobId: null, lockToken: "token", maxAttempts: 3, payload: {}, source: "event", timeoutSeconds: 1, type: "test.job" } as never,
  });
  assert.equal(requeues, 0);
  assert.equal(completions[0]?.status, "failed");
  assert.equal(completions[0]?.errorCode, "invalid-payload");
});

test("unknown exceptions store a safe generic message", async () => {
  const completions: Array<Record<string, unknown>> = [];
  const logs: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values) => { logs.push(values.map(String).join(" ")); };
  try {
    await executeClaimedJobRun({
      getHandler: () => ({ ...handler, execute: async () => { throw new Error("postgres://user:secret@db/private"); } }),
      operations: {
        finish: async (input) => { completions.push(input); return null; },
        requeue: async () => null,
      },
      run: { attempts: 1, id: 11, jobId: null, lockToken: "token", maxAttempts: 1, payload: {}, source: "event", timeoutSeconds: 1, type: "test.job" } as never,
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(completions[0]?.errorMessage, "Не удалось выполнить задачу.");
  assert.doesNotMatch(String(completions[0]?.errorMessage), /secret/);
  assert.doesNotMatch(logs.join("\n"), /secret/);
});

test("timeout aborts a cooperative handler and requeues the same run", async () => {
  const requeues: Array<Record<string, unknown>> = [];
  await executeClaimedJobRun({
    getHandler: () => ({
      ...handler,
      execute: ({ signal }) => new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      }),
    }),
    operations: {
      finish: async () => null,
      requeue: async (input) => { requeues.push(input); return null; },
    },
    run: { attempts: 1, id: 12, jobId: null, lockToken: "same-run-token", maxAttempts: 2, payload: {}, source: "event", timeoutSeconds: 0.01, type: "test.job" } as never,
  });
  assert.equal(requeues.length, 1);
  assert.equal(requeues[0]?.id, 12);
  assert.equal(requeues[0]?.lockToken, "same-run-token");
  assert.equal(requeues[0]?.errorCode, "timeout");
});

test("queue queries retain locking, deduplication, and token guards", async () => {
  const source = await readFile(new URL("../src/db/queries/jobs.ts", import.meta.url), "utf8");
  assert.match(source, /for\("update", \{ skipLocked: true \}\)/);
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(source, /eq\(jobRuns\.lockToken, input\.lockToken\)/);
  assert.match(source, /retryOfRunId: source\.id/);
  assert.match(source, /source: "manual"/);
  assert.match(source, /getNextRunAt\(job\.cronExpression, now\)/);
  assert.match(source, /eq\(jobRuns\.status, "running"\), lte\(jobRuns\.lockExpiresAt, now\)/);
});

test("standalone worker has an independent recovery loop and server-only runtime support", async () => {
  const [runner, handlers, makefile, packageJson] = await Promise.all([
    readFile(new URL("../src/jobs/worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/jobs/handlers.ts", import.meta.url), "utf8"),
    readFile(new URL("../Makefile", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(runner, /Promise\.all\(\[runClaimLoop\(\), runRecoveryLoop\(\)\]\)/);
  assert.match(handlers, /server-only/);
  assert.match(packageJson, /NODE_PATH=\.\/node_modules\/next\/dist\/compiled NODE_OPTIONS=--conditions=react-server tsx src\/jobs\/worker\.ts/);
  assert.match(makefile, /--target jobs-runner/);
  assert.match(makefile, /docker push \$\(JOBS_IMAGE\)/);
});
