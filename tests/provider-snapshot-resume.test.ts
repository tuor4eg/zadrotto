import assert from "node:assert/strict";
import { test } from "node:test";

const testUrl = process.env.JOBS_RESUME_TEST_DATABASE_URL;

test("resuming snapshots preserves checkpoints, fences active work and uses a PK lookup", { skip: !testUrl }, async t => {
  const { default: postgres } = await import("postgres");
  const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
  const schema = `snapshot_resume_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { getTableColumns } = await import("drizzle-orm");
  const { jobRuns } = await import("../src/db/schema");
  const queries = await import("../src/db/queries/jobs");
  const client = getDbClient();
  const now = new Date("2026-10-25T17:00:00Z");
  try {
    await admin.unsafe(`create schema ${schema}`);
    const columns = Object.values(getTableColumns(jobRuns)).map(column =>
      `"${column.name}" ${column.getSQLType()}${column.name === "id" ? " primary key" : ""}`,
    );
    await client.unsafe(`create table job_runs(${columns.join(",")});
      create index job_runs_queue_idx on job_runs(available_at,id) where status='queued'`);
    const payload = { operation: "refresh-process", checkpoint: { afterId: 4875, throughId: 9000, processed: 42, failed: 1, errors: [] } };
    await client.unsafe(`insert into job_runs(id,type,source,status,payload,attempts,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds,
      scheduled_for,available_at,created_at,updated_at,error_code,error_message,lock_token,locked_by,locked_at,lock_expires_at)
      select id,type,'manual',status,$1::text::jsonb,1,3,300,60,3600,
      $2::timestamptz-interval '1 hour',$2::timestamptz+interval '1 hour',$2,$2,'provider-deferred','Quota exhausted',
      case when status='running' then 'worker-token' end,case when status='running' then 'worker' end,
      case when status='running' then $2::timestamptz end,case when status='running' then $2::timestamptz+interval '1 hour' end
      from (values(1,'provider.snapshots','queued'),(2,'provider.snapshots','running'),(3,'provider.snapshots','succeeded'),
      (4,'provider.snapshots','failed'),(5,'provider.snapshots','cancelled'),(6,'other.job','queued'),
      (7,'provider.snapshots','queued'),(8,'provider.snapshots','queued'),(9,'provider.snapshots','queued')) fixture(id,type,status)`, [JSON.stringify(payload), now.toISOString()]);
    const before = await queries.getJobRunById(1);
    assert.ok(before);
    assert.deepEqual(await queries.resumeProviderSnapshotRunNow(1, now), { id: 1, type: "provider.snapshots" });
    const after = await queries.getJobRunById(1);
    assert.deepEqual(after, { ...before, availableAt: now, updatedAt: now, errorCode: null, errorMessage: null });
    assert.equal(await queries.resumeProviderSnapshotRunNow(1, now), null, "a repeated click cannot move an already due run");
    for (const id of [2, 3, 4, 5, 6, 999]) {
      const previous = await client`select * from job_runs where id=${id}`;
      assert.equal(await queries.resumeProviderSnapshotRunNow(id, now), null);
      assert.deepEqual(await client`select * from job_runs where id=${id}`, previous, "only queued snapshots may be resumed");
    }
    const concurrent = await Promise.all([queries.resumeProviderSnapshotRunNow(7, now), queries.resumeProviderSnapshotRunNow(7, now)]);
    assert.equal(concurrent.filter(Boolean).length, 1, "concurrent clicks update the same run once");
    // A worker taking the run while an admin clicks must retain its lease and payload.
    await client`update job_runs set available_at=${now.toISOString()} where id=8`;
    const claimed = await queries.claimNextJobRun({ lockedBy: "resume-test-worker", now });
    assert.equal(claimed?.id, 1, "the existing run is picked up immediately with its saved checkpoint");
    assert.deepEqual(claimed.payload, payload);
    assert.equal(claimed.attempts, 2);
    const claimedAgain = await queries.resumeProviderSnapshotRunNow(claimed.id, now);
    assert.equal(claimedAgain, null);
    assert.equal((await queries.getJobRunById(claimed.id))?.lockToken, claimed.lockToken);

    await client.unsafe(`insert into job_runs(id,type,status,available_at,payload)
      select g,'other.job',case when g%5=0 then 'running' else 'queued' end,now(),'{}'::jsonb
      from generate_series(100,100099) g; analyze job_runs`);
    const captured: Array<{ query: string; params: unknown[] }> = [];
    client.options.debug = (_connection, query, params) => {
      if (/^update/i.test(query.trim())) captured.push({ query, params: [...params] });
    };
    await queries.resumeProviderSnapshotRunNow(9, now);
    await queries.resumeProviderSnapshotRunNow(100100, now);
    client.options.debug = false;
    assert.equal(captured.length, 2);
    for (const { query, params } of captured) {
      const [explained] = await client.unsafe(`explain(format json) ${query}`, params as never[]);
      assert.match(JSON.stringify(explained), /job_runs_pkey/);
      t.diagnostic(JSON.stringify({ rows: 100009, sql: query, plan: explained["QUERY PLAN"] }));
    }
  } finally {
    client.options.debug = false;
    await client.end({ timeout: 1 });
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await admin.end({ timeout: 1 });
  }
});
