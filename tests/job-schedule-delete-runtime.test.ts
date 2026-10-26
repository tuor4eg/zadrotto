import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

const testUrl = process.env.JOB_DELETE_TEST_DATABASE_URL;
test("deleting a schedule preserves runs, audits atomically and serializes with scheduling", { skip: !testUrl, timeout: 120_000 }, async t => {
  const schema = `job_delete_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const client = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const queries = await import("../src/db/queries/jobs");
  const { getNextJobRunAt } = await import("../src/lib/jobs/cron");
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const name of ["jobs", "job_runs", "admin_users", "admin_activity_logs"]) await client.unsafe(`create unlogged table ${schema}.${name} (like public.${name} including all)`);
    await client.unsafe(`alter table job_runs add constraint schedule_fk foreign key(job_id) references jobs(id) on delete set null;
      alter table admin_activity_logs add constraint actor_fk foreign key(admin_user_id) references admin_users(id);
      insert into admin_users(id,login,password_hash) values(1,'schedule-test','unused');
      insert into jobs(id,code,type,cron_expression,next_run_at) select g,'schedule-'||g,'test.task','0 * * * *','2099-01-01' from generate_series(1,3)g;
      insert into job_runs(id,job_id,type,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds,payload)
      select 10000000+g,1,'test.task','schedule',s,now()+g*interval '1 second',now(),3,300,60,3600,'{"checkpoint":{"processed":3}}'::jsonb
      from unnest(array['queued','running','succeeded','failed','cancelled']) with ordinality a(s,g);
      insert into job_runs(id,job_id,type,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(10000010,2,'test.task','schedule','succeeded',now(),now(),3,300,60,3600);`);
    const before = await client`select id,status,payload,source from job_runs where job_id=1 order by id`;
    assert.equal((await queries.deletePeriodicJob(1, 1))?.code, "schedule-1");
    assert.equal((await client`select count(*)::int n from jobs where id=1`)[0].n, 0);
    const after = await client`select id,status,payload,source from job_runs where id between 10000001 and 10000005 order by id`;
    assert.deepEqual([...after], [...before]);
    assert.ok((await client`select job_id from job_runs where id between 10000001 and 10000005`).every(row => row.job_id === null));
    assert.equal((await client`select job_id from job_runs where id=10000010`)[0].job_id, 2);
    assert.equal((await client`select entity_label from admin_activity_logs where action='job.deleted'`)[0].entity_label, "schedule-1");
    assert.equal(await queries.deletePeriodicJob(1, 1), null);
    assert.equal((await client`select count(*)::int n from admin_activity_logs`)[0].n, 1);
    await assert.rejects(queries.deletePeriodicJob(3, 999));
    assert.equal((await client`select count(*)::int n from jobs where id=3`)[0].n, 1, "audit failure rolls back deletion");

    for (let id = 10; id < 20; id++) {
      await client`insert into jobs(id,code,type,cron_expression,next_run_at) values(${id},${`race-${id}`},'test.task','0 * * * *',now()-interval '1 minute')`;
      const [deleted, scheduled] = await Promise.all([
        queries.deletePeriodicJob(id, 1),
        queries.claimDueScheduledJobs({ getNextRunAt: getNextJobRunAt, limit: 10 }),
      ]);
      assert.equal(deleted?.id, id);
      const created = scheduled.filter(run => run.jobId === id);
      assert.ok(created.length <= 1);
      if (created.length) assert.equal((await client`select job_id from job_runs where id=${created[0].id}`)[0].job_id, null);
      assert.equal((await queries.claimDueScheduledJobs({ getNextRunAt: getNextJobRunAt, limit: 10 })).length, 0);
    }

    await client.unsafe(`insert into jobs(id,code,type,cron_expression,next_run_at)
      select g,'scale-'||g,'test.task','0 * * * *','2099-01-01' from generate_series(100,100099)g;
      insert into job_runs(job_id,type,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      select g,'test.task','schedule','succeeded','2025-01-01'::timestamptz+p*interval '1 second',now(),3,300,60,3600
      from generate_series(100,100099)g cross join generate_series(1,5)p;
      insert into job_runs(job_id,type,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      select 100099,'test.task','schedule','succeeded','2025-02-01'::timestamptz+p*interval '1 second',now(),3,300,60,3600 from generate_series(1,10000)p;
      analyze jobs; analyze job_runs; analyze admin_activity_logs;`);
    const output = `/tmp/${schema}-plans.jsonl`; writeFileSync(output, "");
    for (const id of [100098, 100099, 200000]) {
      const [read] = await client.unsafe("explain(analyze,buffers,format json) select * from jobs where id=$1 for update", [id]);
      appendFileSync(output, JSON.stringify({ name: `lock:${id}`, result: read["QUERY PLAN"][0] }) + "\n");
      const [fk] = await client.unsafe("explain(format json) update job_runs set job_id=null where job_id=$1", [id]);
      appendFileSync(output, JSON.stringify({ name: `fk-index:${id}`, result: fk["QUERY PLAN"][0] }) + "\n");
      assert.match(JSON.stringify(fk["QUERY PLAN"]), /Index Scan|Index Only Scan/);
      assert.match(JSON.stringify(fk["QUERY PLAN"]), /job_id = /);
      const rollback = new Error("rollback benchmark");
      try {
        await client.begin(async tx => {
          const [plan] = await tx.unsafe("explain(analyze,buffers,format json) delete from jobs where id=$1", [id]);
          const result = plan["QUERY PLAN"][0];
          appendFileSync(output, JSON.stringify({ name: `delete:${id}`, isolatedMutationRolledBack: true, result }) + "\n");
          t.diagnostic(JSON.stringify({ id, ms: result["Execution Time"], triggers: result.Triggers }));
          assert.match(JSON.stringify(result.Plan), /jobs_pkey/);
          throw rollback;
        });
      } catch (error) { if (error !== rollback) throw error; }
    }
    const [audit] = await client.unsafe("explain(format json) insert into admin_activity_logs(action,actor_type,admin_user_id,entity_type,entity_id,entity_label,status,severity,message,metadata) values('job.deleted','admin',1,'job',2,'schedule-2','success','info','Deleted','{}')");
    appendFileSync(output, JSON.stringify({ name: "audit-insert", result: audit["QUERY PLAN"][0] }) + "\n");
    t.diagnostic(`Plans: ${output}. Scale: 100000 schedules, 510000 history rows; mutations measured only in disposable schema and rolled back.`);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(), client.end()]);
  }
});
