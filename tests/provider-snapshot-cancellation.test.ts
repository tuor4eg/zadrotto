import assert from "node:assert/strict";
import { test } from "node:test";

test("snapshot cancellation fences old workers and preserves resumable payload", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async t => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const original = process.env.DATABASE_URL!;
  const admin = postgres(original, { max: 1, prepare: false });
  const schema = `snapshot_cancel_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}; create table ${schema}.job_runs (like public.job_runs including defaults including constraints including indexes);
    create sequence ${schema}.job_run_ids;
    alter table ${schema}.job_runs alter column id set default nextval('${schema}.job_run_ids')`);
  const url = new URL(original);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(`insert into job_runs(id,type,source,status,payload,lock_token,lock_expires_at,locked_at,locked_by,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      select id,type,'manual',status,'{"operation":"process","checkpoint":{"afterId":42,"throughId":100,"processed":7,"failed":0,"errors":[]}}'::jsonb,
      case when status='running' then 'old-token' end,case when status='running' then now()+interval '1 hour' end,
      case when status='running' then now() end,case when status='running' then 'test-worker' end,now(),now(),3,300,60,3600
      from (values(1,'test.job','queued'),(2,'provider.snapshots','running'),(3,'test.job','running'),(4,'provider.snapshots','succeeded'),(5,'provider.snapshots','running'),(6,'provider.snapshots','queued')) fixture(id,type,status)`);
    const queries = await import("../src/db/queries/jobs");
    const { withSnapshotJobGuard } = await import("../src/db/queries/provider-snapshots");
    const [before] = await client`select payload from job_runs where id=2`;
    assert.equal(await queries.isJobRunLeaseCurrent({ id: 2, lockToken: "old-token" }), true);
    assert.equal(await queries.isJobRunLeaseCurrent({ id: 2, lockToken: "other-token" }), false);
    await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=5`;
    assert.equal(await queries.isJobRunLeaseCurrent({ id: 5, lockToken: "old-token" }), false);
    assert.equal((await queries.cancelJobRun(1))?.status, "cancelled", "any queued job remains cancellable");
    assert.equal(await queries.cancelQueuedJobRun(2), null, "legacy queued-only helper cannot stop running work");
    assert.equal((await queries.cancelQueuedJobRun(6))?.status, "cancelled");
    assert.equal(await queries.cancelJobRun(3), null, "unrelated running jobs retain previous behavior");
    assert.equal(await queries.cancelJobRun(4), null);
    const cancelled = await queries.cancelJobRun(2);
    assert.equal(cancelled?.status, "cancelled");
    assert.ok(cancelled?.cancelledAt);
    assert.ok(cancelled?.finishedAt);
    for (const key of ["lockToken", "lockExpiresAt", "lockedAt", "lockedBy"] as const) assert.equal(cancelled?.[key], null);
    assert.deepEqual(cancelled?.payload, before.payload);
    assert.equal(await queries.cancelJobRun(2), null, "repeated stop does not overwrite the terminal state");
    assert.equal(await queries.isJobRunLeaseCurrent({ id: 2, lockToken: "old-token" }), false);
    let guardedWrite = false;
    await assert.rejects(withSnapshotJobGuard({ runId: 2, lockToken: "old-token" }, async () => { guardedWrite = true; }), /STALE_SNAPSHOT_JOB/);
    assert.equal(guardedWrite, false);
    assert.equal(await queries.finishJobRun({ id: 2, lockToken: "old-token", status: "succeeded" }), null);
    assert.equal(await queries.finishJobRun({ id: 2, lockToken: "old-token", status: "failed" }), null);
    assert.equal(await queries.requeueJobRun({ id: 2, lockToken: "old-token", errorCode: "timeout", errorMessage: "Test" }), null);
    await queries.deferJobRun({ id: 2, lockToken: "old-token", delaySeconds: 1, errorCode: "continue", errorMessage: "Test" });
    const [after] = await client`select status,payload,lock_token from job_runs where id=2`;
    assert.deepEqual(after, { status: "cancelled", payload: before.payload, lock_token: null });
    // PK probes must remain bounded even with many journal entries.
    await client.unsafe(`insert into job_runs(id,type,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      select g,'test.job','manual',case when g%5=0 then 'running' else 'queued' end,now(),now(),3,300,60,3600 from generate_series(100,100099)g; analyze job_runs`);
    const captured: Array<{ query: string; params: unknown[] }> = [];
    client.options.debug = (_connection, query, params) => { if (/^(select|update)/i.test(query.trim())) captured.push({ query, params: [...params] }); };
    await queries.isJobRunLeaseCurrent({ id: 3, lockToken: "old-token" });
    await queries.cancelJobRun(3);
    client.options.debug = false;
    assert.ok(captured.length >= 2);
    for (const { query, params } of captured) {
      const [explained] = await client.unsafe((/^select/i.test(query.trim()) ? "explain(analyze, buffers, format json) " : "explain(format json) ") + query, params as never[]);
      assert.match(JSON.stringify(explained), /job_runs_pkey/);
      t.diagnostic(JSON.stringify({ rows: 100006, queryKind: query.trim().split(/\s+/)[0], plan: explained["QUERY PLAN"] }));
    }
  } finally {
    client.options.debug = false;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
