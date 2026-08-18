import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildJobJournalHref } from "../src/app/admin/(protected)/tools/jobs/journal/href";
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

test("job history is retained per schedule and cleanup preserves active runs", async () => {
  const [queries, schema, handlers, migration] = await Promise.all([
    readFile(new URL("../src/db/queries/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/jobs/handlers.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0057_job_run_history.sql", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /historyRetentionDays: integer\("history_retention_days"\)\.default\(30\)\.notNull\(\)/);
  assert.match(schema, /jobs_history_retention_days_check/);
  assert.match(queries, /terminalStatuses: JobRunStatus\[\] = \["succeeded", "failed", "cancelled"\]/);
  assert.doesNotMatch(queries, /terminalStatuses[^;]+"queued"/);
  assert.doesNotMatch(queries, /terminalStatuses[^;]+"running"/);
  assert.match(handlers, /type: "jobs\.cleanup-history"/);
  assert.match(migration, /'jobs-history-cleanup'[\s\S]*'30 3 \* \* \*'[\s\S]*true/);
});

test("achievement backfill is enqueue-only and cannot be created as a periodic schedule", async () => {
  const [handlers, manage, schedules, manager] = await Promise.all([
    readFile(new URL("../src/lib/jobs/handlers.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/jobs/manage.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/schedules/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/jobs-manager.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(handlers, /type: "achievements\.backfill"[\s\S]*schedulable: false/);
  assert.match(manage, /if \(handler\.schedulable === false\) throw new Error/);
  assert.match(schedules, /schedulable: schedulable !== false/);
  assert.match(manager, /handlers\.filter\(\(item\) => item\.schedulable \|\| item\.type === job\?\.type\)/);
  assert.match(manager, /AdHocJobButton[\s\S]*handlers\.map\(\(item\) => <option key=\{item\.type\}/);
});

test("jobs admin separates schedules from paginated run history", async () => {
  const [layout, nav, schedules, journal, filters, queries] = await Promise.all([
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/jobs-tools-nav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/schedules/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/journal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/journal/job-journal-filters.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/db/queries/jobs.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lg:grid-cols-\[220px_minmax\(0,1fr\)\]/);
  assert.match(nav, /Расписания/);
  assert.match(nav, /Журнал/);
  assert.match(schedules, /getLatestJobRuns/);
  assert.match(journal, /pageSize/);
  assert.match(journal, /Страница \{result\.page\} из \{result\.totalPages\}/);
  assert.match(journal, /parseJobFilter\(query\.job, jobs\)/);
  assert.match(journal, /jobId === undefined \? "all"/);
  assert.doesNotMatch(journal, /Показать/);
  assert.match(filters, /option value="all">Все запуски/);
  assert.match(filters, /onChange=\{\(event\) => replaceFilters\(\{ job: event\.currentTarget\.value \}\)\}/);
  assert.match(queries, /selectDistinctOn\(\[jobRuns\.jobId\]/);
  assert.match(queries, /offset\(\(page - 1\) \* pageSize\)/);
  assert.match(queries, /jobId\?: number \| "adhoc"/);
  assert.match(queries, /input\.jobId === "adhoc" \? \[isNull\(jobRuns\.jobId\)\] : input\.jobId \? \[eq\(jobRuns\.jobId, input\.jobId\)\] : \[\]/);
});

test("job journal href omits the default all-runs filter", () => {
  assert.equal(buildJobJournalHref({ job: "all", page: 1, pageSize: 25 }), "/admin/tools/jobs/journal");
  assert.equal(buildJobJournalHref({ job: "adhoc", page: 2, pageSize: 50 }), "/admin/tools/jobs/journal?job=adhoc&page=2&pageSize=50");
  assert.equal(buildJobJournalHref({ job: "12", page: 1, pageSize: 25 }), "/admin/tools/jobs/journal?job=12");
});

test("metadata jobs seed two enabled schedules with split cron and payloads", async () => {
  const [handlers, migration, manager] = await Promise.all([
    readFile(new URL("../src/lib/jobs/handlers.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0070_media_metadata_refresh.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/(protected)/tools/jobs/jobs-manager.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(handlers, /type: "media\.metadata-backfill"/);
  assert.match(handlers, /type: "media\.metadata-refresh"/);
  assert.match(handlers, /backfillMediaMetadata\(\{ attempt, runId, \.\.\.payload \}\)/);
  assert.match(handlers, /refreshStaleMediaMetadata\(\{ attempt, runId, \.\.\.payload \}\)/);
  assert.match(handlers, /result\.retryableFailed > 0/);
  assert.match(
    migration,
    /'media-metadata-backfill',[\s\S]*'media\.metadata-backfill',[\s\S]*'\{"limit":25,"quotaReserve":100\}'::jsonb,[\s\S]*'0 4 \* \* \*',[\s\S]*true/,
  );
  assert.match(
    migration,
    /'media-metadata-refresh',[\s\S]*'media\.metadata-refresh',[\s\S]*'\{"limit":20,"staleDays":90,"quotaReserve":100\}'::jsonb,[\s\S]*'0 5 \* \* 0',[\s\S]*true/,
  );
  assert.match(migration, /ON CONFLICT \("code"\) DO NOTHING/);
  assert.match(manager, /name="payload" value="\{\}"/);
});

