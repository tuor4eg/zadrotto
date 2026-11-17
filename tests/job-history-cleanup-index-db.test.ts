import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.JOB_HISTORY_TEST_DATABASE_URL;

test("history cleanup: retry FK lookup is indexed and retention semantics stay unchanged", { skip: !databaseUrl, timeout: 120000 }, async t => {
  const name = `job_history_${process.pid}_${Date.now()}`;
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const url = new URL(databaseUrl!);
  url.pathname = `/${name}`;
  let client: ReturnType<typeof postgres> | undefined;
  let closeApp: (() => Promise<void>) | undefined;
  const oldUrl = process.env.DATABASE_URL;
  try {
    await admin.unsafe(`create database ${name}`);
    client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await client.unsafe(`
      create table jobs(id int primary key, history_retention_days int not null);
      insert into jobs values(1,30);
      create table job_runs(id int primary key, job_id int references jobs(id), status text,
        finished_at timestamptz, retry_of_run_id int references job_runs(id) on delete set null);
      create index job_runs_job_finished_idx on job_runs(job_id,finished_at);
      insert into job_runs select g,1,'succeeded','2026-01-01'::timestamptz,null from generate_series(1,100000)g;
      insert into job_runs values(100001,1,'queued',null,1),(100002,1,'running',null,null),
        (100003,1,'failed','2026-11-11',null),(100004,null,'cancelled','2026-01-01',null);
      analyze job_runs;
    `);
    // Mutations are benchmarked only inside this disposable database, then rolled back.
    const measure = async () => {
      await client!.unsafe("begin");
      try {
        const [row] = await client!.unsafe("explain(analyze,buffers,format json) delete from job_runs where id<=1000");
        return row["QUERY PLAN"][0];
      } finally { await client!.unsafe("rollback"); }
    };
    const before = await measure();
    await client.unsafe(await readFile("drizzle/0010_job_run_retry_lookup.sql", "utf8"));
    await client`analyze job_runs`;
    const after = await measure();
    const [lookup] = await client.unsafe("explain(analyze,buffers,format json) select id from job_runs where retry_of_run_id=1");
    assert.equal(lookup["QUERY PLAN"][0].Plan["Index Name"], "job_runs_retry_of_run_id_idx");
    t.diagnostic(JSON.stringify({ runs: 100004, deletedPerProbe: 1000, beforeMs: before["Execution Time"], afterMs: after["Execution Time"], beforeFkMs: before.Triggers?.[0]?.Time, afterFkMs: after.Triggers?.[0]?.Time }));
    process.env.DATABASE_URL = url.toString();
    const { getDbClient } = await import("../src/db");
    closeApp = () => getDbClient().end({ timeout: 2 });
    const { cleanupJobRunHistory } = await import("../src/db/queries/jobs");
    assert.equal(await cleanupJobRunHistory(new Date("2026-11-12T00:00:00Z")), 100001);
    const retained = await client`select id,status,retry_of_run_id from job_runs order by id`;
    assert.deepEqual(Array.from(retained), [
      { id: 100001, status: "queued", retry_of_run_id: null },
      { id: 100002, status: "running", retry_of_run_id: null },
      { id: 100003, status: "failed", retry_of_run_id: null },
    ]);
  } finally {
    await closeApp?.();
    await client?.end({ timeout: 2 });
    await admin.unsafe(`drop database if exists ${name}`);
    await admin.end();
    if (oldUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldUrl;
  }
});
