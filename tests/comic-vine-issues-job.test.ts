import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { after, test } from "node:test";
import path from "node:path";
import { JobError } from "../src/lib/jobs/types";

process.env.NODE_PATH = [path.join(process.cwd(), "tests/fixtures/node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
(Module as unknown as { _initPaths: () => void })._initPaths();
const require = createRequire(import.meta.url);
const originals = new Map<string, NodeModule | undefined>();
function stub(path: string, exports: object) {
  const id = require.resolve(path);
  originals.set(id, require.cache[id]);
  const fixture = new Module(id);
  fixture.filename = id; fixture.loaded = true; fixture.exports = exports;
  require.cache[id] = fixture;
}
let payloadSaved: Record<string, unknown>;
let disabled = false;
let volumeHash = "volume-hash";
let failIssue = "";
let transportFailure = false;
const fetched: string[] = [];
const applied: number[] = [];
const linked = new Map<number, Set<string>>();
const fakeDb = {
  select: () => ({ from: () => ({ where: async () => [{ payload: payloadSaved }], innerJoin: () => ({ where: async () => [{ provider: "comic-vine", externalId: "1", mediaType: "comic", disabled }] }) }) }),
  update: () => ({ set: (value: { payload: Record<string, unknown> }) => ({ where: async () => { if (value.payload) payloadSaved = value.payload; } }) }),
};
stub("../src/db", { db: fakeDb });
stub("../src/db/queries/provider-snapshots", { withSnapshotJobGuard: async (_guard: unknown, callback: (tx: typeof fakeDb) => Promise<void>) => callback(fakeDb) });
stub("../src/db/queries/comic-vine-issue-aggregation", { applyComicVineIssueAggregation: async (_tx: unknown, input: { mediaItemId: number; issue?: { id: number } }) => { if (input.issue) { applied.push(input.issue.id); const ids = linked.get(input.mediaItemId) ?? new Set<string>(); ids.add(String(input.issue.id)); linked.set(input.mediaItemId, ids); } } });
stub("../src/db/queries/cover-settings", {
  getCoverSettings: async () => ({ providerRequestTimeoutMs: 1000 }), getCoverProviderSettings: async () => [{ mediaType: "comic", providerCode: "comic-vine", enabled: true }],
  getCoverProviderRateLimits: async () => [], getCoverProviderCredentialsForSearch: async () => ({}),
});
stub("../src/lib/covers/rate-limits", { createProviderCoverSearchRateLimiter: () => ({ canSearchProvider: async () => true }), wrapProviderSearchWithReserve: () => async () => true });
stub("../src/lib/providers/comic-vine-service", {
  getLinkedComicVineIssueIds: async (id: number) => linked.get(id) ?? new Set<string>(),
  getSavedComicVineBundle: async () => ({ primary: { id: 1, providerCode: "comic-vine", externalId: "1", payloadHash: volumeHash, payload: { id: 1, count_of_issues: 7, issues: Array.from({ length: 7 }, (_, i) => ({ id: i + 10 })) } } }),
  fetchComicVineSnapshot: async (descriptor: { externalId: string }) => {
    fetched.push(descriptor.externalId);
    if (descriptor.externalId === failIssue && transportFailure) throw new Error("network failure");
    if (descriptor.externalId === failIssue) throw Object.assign(new Error("HTTP 429"), { status: 429, retryAfterSeconds: 60 });
    return { id: Number(descriptor.externalId), payloadHash: "issue-hash" };
  },
});
// Avoid server-only runtime imports at this orchestration boundary.
stub("../src/lib/providers/snapshot-item-errors", {
  snapshotItemError: () => ({ id: 1, code: "safe-error" }), snapshotItemErrorMessage: () => "Ошибка источника.",
  snapshotProviderDeferral: (error: { status?: number }) => error.status === 429 ? { message: "Лимит источника.", deferSeconds: 60 } : null,
});
stub("../src/db/queries/comic-vine-pending", {
  getPendingComicVineItemsQuery: async ({ afterId, mediaItemId }: { afterId: number; mediaItemId?: number }) => [1, 2].filter(id => id > afterId && (!mediaItemId || id === mediaItemId)).slice(0, 1).map(id => ({ id })),
});
const jobPath = require.resolve("../src/lib/providers/comic-vine-issues-job");
const { runComicVineIssueItem, parseComicVineIssueItemPayload: parse, comicVineIssuesJobHandler: scheduledHandler, parseComicVineIssuesPayload: parseSchedule } = require(jobPath) as typeof import("../src/lib/providers/comic-vine-issues-job");
after(() => { delete require.cache[jobPath]; for (const [id, old] of originals) { if (old) require.cache[id] = old; else delete require.cache[id]; } });

const execute = (payload: ReturnType<typeof parse>, signal = new AbortController().signal) => runComicVineIssueItem({ payload, runId: 7, lockToken: "lease", signal, attempt: 1, jobId: null, source: "manual" });

test("validates media IDs and rejects malformed progress", () => {
  for (const value of [null, {}, { mediaItemId: 0 }, { mediaItemId: 1.5 }, { mediaItemId: "1" }, { mediaItemId: 1, checkpoint: { processed: -1 } }]) assert.throws(() => parse(value), JobError);
  assert.deepEqual(parse({ mediaItemId: 1 }), { mediaItemId: 1 });
});

test("batches all issues, resumes after quota deferral and rejects changed volume", async () => {
  await assert.rejects(execute({ mediaItemId: 1 }), (error: JobError) => error.code === "comic-issues-continue");
  assert.deepEqual(applied, [10, 11, 12, 13, 14]);
  const resume = parse(payloadSaved);
  assert.equal(resume.checkpoint?.processed, 5);
  failIssue = "15";
  await assert.rejects(execute(resume), (error: JobError) => error.code === "provider-deferred" && error.deferSeconds === 60);
  assert.equal(parse(payloadSaved).checkpoint?.processed, 5);
  failIssue = "";
  volumeHash = "changed";
  const calls = fetched.length;
  await assert.rejects(execute(resume), (error: JobError) => error.code === "source-changed" && !error.retryable);
  assert.equal(fetched.length, calls);
  volumeHash = "volume-hash";
  await execute(resume);
  assert.deepEqual(applied, [10, 11, 12, 13, 14, 15, 16]);
  assert.equal(parse(payloadSaved).checkpoint?.processed, 7);
});

test("opt-out and cancellation stop before fetching issues", async () => {
  const calls = fetched.length;
  disabled = true;
  await assert.rejects(execute({ mediaItemId: 1 }), (error: JobError) => error.code === "metadata-disabled");
  disabled = false;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(execute({ mediaItemId: 1 }, controller.signal));
  assert.equal(fetched.length, calls);
});

test("scheduled payload defaults to all pending comics and validates limits", () => {
  assert.deepEqual(parseSchedule({}), { limit: 25 });
  assert.equal(scheduledHandler.schedulable, true);
  for (const input of [{ limit: 0 }, { limit: 201 }, { mediaItemId: -1 }, { checkpoint: {} }]) assert.throws(() => parseSchedule(input), JobError);
});

test("issue budget ends the run and a new scheduled run resumes durable progress", async () => {
  linked.clear();
  const context = { runId: 7, lockToken: "lease", signal: new AbortController().signal, attempt: 1, jobId: null, source: "schedule" as const };
  const run = (limit: number) => scheduledHandler.execute({ ...context, payload: parseSchedule({ limit }) });
  const before = fetched.length;
  await run(2);
  assert.equal(fetched.length - before, 2);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.issueAttempts, 2);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.completed, 0);
  await run(2);
  assert.deepEqual(fetched.slice(before), ["10", "11", "12", "13"]);
  await run(3);
  assert.deepEqual(fetched.slice(before), ["10", "11", "12", "13", "14", "15", "16"]);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.completed, 1);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.issueAttempts, 3);
  const calls = fetched.length;
  await scheduledHandler.execute({ ...context, payload: parseSchedule(payloadSaved) });
  assert.equal(fetched.length, calls);
});

test("failed issue requests also spend the budget without automatic retries beyond it", async () => {
  linked.clear();
  const context = { runId: 7, lockToken: "lease", signal: new AbortController().signal, attempt: 1, jobId: null, source: "schedule" as const };
  failIssue = "10"; transportFailure = true;
  const before = fetched.length;
  await assert.rejects(scheduledHandler.execute({ ...context, payload: parseSchedule({ limit: 1 }) }), (error: JobError) => !error.retryable && error.deferSeconds === null);
  assert.equal(fetched.length - before, 1);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.issueAttempts, 1);
  await scheduledHandler.execute({ ...context, payload: parseSchedule(payloadSaved) });
  assert.equal(fetched.length - before, 1);
  failIssue = ""; transportFailure = false;
});

test("transient retries preserve both issue cursor and spent budget", async () => {
  linked.clear();
  const context = { runId: 7, lockToken: "lease", signal: new AbortController().signal, attempt: 1, jobId: null, source: "schedule" as const };
  failIssue = "12"; transportFailure = true;
  const before = fetched.length;
  await assert.rejects(scheduledHandler.execute({ ...context, payload: parseSchedule({ limit: 4 }) }), (error: JobError) => error.code === "comic-item-retry");
  const state = parseSchedule(payloadSaved);
  assert.equal(state.checkpoint?.item?.checkpoint?.processed, 2);
  assert.equal(state.checkpoint?.issueAttempts, 3);
  assert.equal(state.checkpoint?.retries, 1);
  failIssue = ""; transportFailure = false;
  await scheduledHandler.execute({ ...context, payload: state });
  assert.equal(fetched.length - before, 4);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.item?.checkpoint?.processed, 3);
});

test("budget exhaustion retains errors from earlier comics in the run status", async () => {
  linked.clear();
  const payload = parseSchedule({ limit: 1, checkpoint: { afterId: 0, completed: 0, failed: 1, errors: [{ id: 99, code: "source-changed" }] } });
  await assert.rejects(scheduledHandler.execute({ payload, runId: 7, lockToken: "lease", signal: new AbortController().signal, attempt: 1, jobId: null, source: "schedule" }), (error: JobError) => error.code === "comic-items-failed" && !error.retryable);
  assert.equal(parseSchedule(payloadSaved).checkpoint?.issueAttempts, 1);
});
