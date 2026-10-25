import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const testUrl=process.env.CURRENT_JOBS_TEST_DATABASE_URL;
test("current jobs and universal cancellation keep indexed reads, checkpoints and domain states", { skip:!testUrl,timeout:120000 }, async t => {
  const schema=`current_jobs_${process.pid}_${Date.now()}`;
  const url=new URL(testUrl!);url.searchParams.set("options",`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.toString();
  const { getDbClient }=await import("../src/db"); const client=getDbClient();
  const queries=await import("../src/db/queries/current-jobs"); const jobs=await import("../src/db/queries/jobs");
  const { withSnapshotJobGuard }=await import("../src/db/queries/provider-snapshots");
  try {
    await client.unsafe(`create schema ${schema};
      create unlogged table jobs(id integer primary key,code text,enabled boolean); insert into jobs values(1,'Scheduled test',true);
      create unlogged table job_runs(id serial primary key,job_id integer,type text,payload jsonb default '{}',source text,status text default 'queued',attempts integer default 0,max_attempts integer default 3,
        retry_of_run_id integer,created_by_admin_id integer,scheduled_for timestamptz default now(),timeout_seconds integer default 300,retry_base_seconds integer default 60,retry_max_seconds integer default 3600,
        created_at timestamptz default now(),updated_at timestamptz default now(),started_at timestamptz,finished_at timestamptz,available_at timestamptz default now(),lock_expires_at timestamptz,
        cancelled_at timestamptz,lock_token text,locked_at timestamptz,locked_by text,error_message text,error_code text);
      create unlogged table admin_exports(id uuid primary key,status text,error_message text,finished_at timestamptz,updated_at timestamptz,created_by_admin_id integer default 1,entity_type text default 'media_items',fields jsonb default '[]',filters jsonb default '{}',sort text default 'id',row_count integer,file_size bigint,object_key text,expires_at timestamptz,started_at timestamptz,created_at timestamptz default now());
      create unlogged table level_settings(id integer primary key,status text,updated_at timestamptz);
      insert into level_settings values(1,'initializing',now());
      insert into job_runs(id,type,status,source,job_id,payload,lock_token,lock_expires_at,started_at) values
        (1,'test.task','running','schedule',1,'{"checkpoint":{"processed":3}}','owner',now()+interval '1 hour',now()),
        (2,'provider.snapshots','queued','manual',null,'{}',null,null,null),
        (3,'test.task','succeeded','manual',null,'{}',null,null,null),
        (4,'admin.export-generate','running','manual',null,'{"exportId":"00000000-0000-0000-0000-000000000001"}','owner',now()+interval '1 hour',now()),
        (5,'reputation.initialize','queued','manual',null,'{}',null,null,null),
        (6,'test.task','queued','event',null,'{}',null,null,null);
      insert into admin_exports(id,status,updated_at) values('00000000-0000-0000-0000-000000000001','running',now());`);
    const page=await queries.getCurrentJobRuns({ page:1,pageSize:25 });
    assert.equal(page.totalCount,5); assert.equal(page.running,2); assert.equal(page.queued,3);
    assert.deepEqual(page.items.map(r=>r.status),['running','running','queued','queued','queued']);
    assert.equal(page.items.find(r=>r.id===1)?.jobCode,'Scheduled test');
    assert.equal(await jobs.cancelQueuedJobRun(1),null);
    const cancelled=await jobs.cancelJobRun(1);
    assert.equal(cancelled?.status,'cancelled'); assert.equal(cancelled?.lockToken,null);
    assert.deepEqual(cancelled?.payload,{ checkpoint:{ processed:3 } });
    assert.equal((await client`select enabled from jobs where id=1`)[0].enabled,true);
    await assert.rejects(withSnapshotJobGuard({ runId:1,lockToken:'owner' },async()=>{ throw new Error('should never execute'); }),/STALE_SNAPSHOT_JOB/);
    assert.equal(await jobs.cancelJobRun(1),null); assert.equal(await jobs.cancelJobRun(3),null);
    await jobs.cancelJobRun(4);
    assert.equal((await client`select status from admin_exports`)[0].status,'failed');
    await jobs.cancelJobRun(5);
    assert.equal((await client`select status from level_settings`)[0].status,'disabled');
    await client`update job_runs set status='queued' where id=5`; await client`update level_settings set status='enabled'`;
    await jobs.cancelJobRun(5); assert.equal((await client`select status from level_settings`)[0].status,'enabled');
    await client`update job_runs set status='queued' where id=4`; await client`update admin_exports set status='ready'`;
    await jobs.cancelJobRun(4); assert.equal((await client`select status from admin_exports`)[0].status,'ready');
    const { cancelQueuedAdminExport }=await import("../src/db/queries/admin-exports");
    await client`update admin_exports set status='queued'`;await client`update job_runs set status='queued' where id=4`;
    assert.equal(await cancelQueuedAdminExport('00000000-0000-0000-0000-000000000001',2),null);
    assert.equal((await cancelQueuedAdminExport('00000000-0000-0000-0000-000000000001',1))?.status,'expired');
    await client`update admin_exports set status='queued'`;await client`update job_runs set status='running',lock_token='owner',lock_expires_at=now()+interval '1 hour' where id=4`;
    assert.equal(await cancelQueuedAdminExport('00000000-0000-0000-0000-000000000001',1),null,'claimed run cannot be cancelled by queued-only export action');
    const { beginReputationInitialization }=await import("../src/db/queries/reputation");
    await client.unsafe("select setval('job_runs_id_seq',2000000)");
    const request={ adminId:1,policy:{ maxAttempts:1,timeoutSeconds:900,retryBaseSeconds:60,retryMaxSeconds:3600 } };
    const starts=await Promise.all([beginReputationInitialization(request),beginReputationInitialization(request)]);
    assert.equal(starts.filter(Boolean).length,1,'state and enqueue are atomic for concurrent initialization requests');
    const [initialization]=await client`select id from job_runs where type='reputation.initialize' and status='queued'`;
    await client`update level_settings set status='enabled'`;
    assert.equal(await beginReputationInitialization(request),null,'completed domain work still owned by active run blocks another init');
    await jobs.cancelJobRun(initialization.id);
    assert.equal((await client`select status from level_settings`)[0].status,'enabled');
    await client`update level_settings set status='disabled'`;
    await beginReputationInitialization(request);
    const [nextInit]=await client`select id from job_runs where type='reputation.initialize' and status='queued'`;
    await jobs.cancelJobRun(nextInit.id);assert.equal((await client`select status from level_settings`)[0].status,'disabled');
    const cancelledQuery: { query:string;params:unknown[] }[]=[];
    client.options.debug=(_connection,query,params)=>{if(/^(update|insert|select)/i.test(query)) cancelledQuery.push({ query,params:[...params] });};
    await client`update job_runs set status='queued' where id in (4,5)`;await jobs.cancelJobRun(4);await jobs.cancelJobRun(5);
    await client`update admin_exports set status='queued'`;await client`update job_runs set status='queued' where id=4`;
    await cancelQueuedAdminExport('00000000-0000-0000-0000-000000000001',1);
    await beginReputationInitialization(request);
    client.options.debug=false;
    for (const q of cancelledQuery) await client.unsafe('explain(format json) '+q.query,q.params as never[]);
    await client.unsafe(`insert into job_runs(id,type,status,source,job_id,created_at)
      select 100+g,'test.task','succeeded','manual',null,now()-interval '1 day' from generate_series(1,500000)g;
      insert into job_runs(id,type,status,source,job_id,created_at)
      select 600000+g,'test.task',case when g%3=0 then 'running' else 'queued' end,'event',case when g%5=0 then 1 end,now() from generate_series(1,1000)g; analyze job_runs;`);
    const measure=async(name:string,query:{sql:string;params:unknown[]})=>{
      const [row]=await client.unsafe('explain(analyze,buffers,format json) '+query.sql,query.params as never[]);
      const plan=row['QUERY PLAN'][0];t.diagnostic(JSON.stringify({ name,history:500000,active:1003,ms:plan['Execution Time'],plan:plan.Plan })); return plan;
    };
    await measure('before-count',queries.currentJobCountsQuery().toSQL());
    await measure('before-page',queries.currentJobRunsQuery(1,50).toSQL());
    await client.unsafe(readFileSync('drizzle/0137_current_jobs.sql','utf8')); await client.unsafe('analyze job_runs');
    for (const q of cancelledQuery.filter(q=>/^select/i.test(q.query))) {
      await measure('dependent-lookup',{ sql:q.query,params:q.params });
    }
    const counts=await measure('after-count',queries.currentJobCountsQuery().toSQL());
    const first=await measure('after-page',queries.currentJobRunsQuery(1,50).toSQL());
    const last=await measure('after-deep-page',queries.currentJobRunsQuery(20,50).toSQL());
    assert.match(JSON.stringify(counts),/job_runs_current_idx/);assert.match(JSON.stringify(first),/job_runs_current_idx/);assert.match(JSON.stringify(last),/job_runs_current_idx/);
    await client.unsafe("update job_runs set status='succeeded' where status in ('queued','running'); analyze job_runs");
    await measure('after-empty',queries.currentJobCountsQuery().toSQL());
    const empty=await queries.getCurrentJobRuns({page:100});assert.equal(empty.page,1);assert.equal(empty.totalCount,0);assert.deepEqual(empty.items,[]);
  } finally { client.options.debug=false;await client.unsafe(`drop schema if exists ${schema} cascade`);await client.end(); }
});
