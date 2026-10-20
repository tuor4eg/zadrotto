import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("P1 jobs: real recovery, terminal states, manual retry and guarded export results", {skip:!process.env.P1_TEST_DATABASE_URL}, async t => {
  const {default:postgres}=await import("postgres");
  const admin=postgres(process.env.P1_TEST_DATABASE_URL!,{max:1,onnotice:()=>{}});
  const schema=`p1_jobs_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url=new URL(process.env.P1_TEST_DATABASE_URL!);url.searchParams.set("options",`-c search_path=${schema},public`);
  process.env.DATABASE_URL=url.toString();
  const {getDbClient}=await import("../src/db");const client=getDbClient();
  try {
    const tables=await import("../src/db/schema");
    const {getTableConfig}=await import("drizzle-orm/pg-core");
    for(const table of [tables.jobRuns,tables.automoderationChecks,tables.adminExports]) {
      const config=getTableConfig(table);
      const cols=config.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?" primary key":""}${["created_at","updated_at"].includes(c.name)?" default clock_timestamp()":c.name==="status"?" default 'queued'":c.name==="attempts"?" default 0":""}`);
      await client.unsafe(`create table ${config.name}(${cols.join(",")})`);
    }
    await client.unsafe(`create unique index job_runs_automoderation_active_unique on job_runs((payload->>'checkId')) where type='moderation.auto-check' and status in('queued','running')`);
    const jobs=await import("../src/db/queries/jobs");
    const {markAdminExportReady,markAdminExportFailed}=await import("../src/db/queries/admin-exports");
    const addJob=async(id:number,checkId:number,expired=true,attempts=1,maxAttempts=1)=>{
      await client`insert into job_runs(id,type,payload,status,source,attempts,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds,lock_token,lock_expires_at,available_at,scheduled_for)
      values(${id},'moderation.auto-check',${JSON.stringify({checkId})}::text::jsonb,'running','event',${attempts},${maxAttempts},60,60,3600,${`token-${id}`},clock_timestamp()+${expired?'-1 hour':'1 hour'}::interval,now(),now())`;
      await client`insert into automoderation_checks(id,status,subject_type,subject_key,subject_revision,policy_code,policy_version,mode,input_fingerprint)
      values(${checkId},'running','media-item',${String(checkId)},1,'test',1,'enforce','test')`;
    };
    await t.test("expired single-attempt job and its running check recover atomically",async()=>{
      await addJob(1,1);
      await jobs.recoverExpiredJobRuns();
      const [job]=await client`select status,lock_token from job_runs where id=1`;
      const [check]=await client`select status,decision from automoderation_checks where id=1`;
      assert.deepEqual({...job},{status:"failed",lock_token:null});
      assert.deepEqual({...check},{status:"completed",decision:"NEEDS_REVIEW"});
      await assert.rejects(jobs.retryFailedJobRun(1,null),/Проверка завершена/);
    });
    await t.test("retryable job keeps check pending and queued job prevents orphan finalization",async()=>{
      await addJob(2,2,true,1,2);
      await jobs.recoverExpiredJobRuns();
      const [check]=await client`select status from automoderation_checks where id=2`;
      assert.equal(check.status,"pending");
      await jobs.recoverExpiredJobRuns();
      assert.equal((await client`select status from automoderation_checks where id=2`)[0].status,"pending");
      await jobs.cancelQueuedJobRun(2);
      assert.equal((await client`select decision from automoderation_checks where id=2`)[0].decision,"NEEDS_REVIEW");
    });
    await t.test("committed approval is preserved after crash before job finish",async()=>{
      await addJob(3,3);
      await client`update automoderation_checks set status='completed',decision='AUTO_APPROVE',auto_approved_at=now() where id=3`;
      await jobs.recoverExpiredJobRuns();
      assert.equal((await client`select decision from automoderation_checks where id=3`)[0].decision,"AUTO_APPROVE");
    });
    await t.test("expired owner cannot finish succeeded even before recovery runs",async()=>{
      await addJob(4,4);
      assert.equal(await jobs.finishJobRun({id:4,lockToken:"token-4",status:"succeeded"}),null);
      await jobs.recoverExpiredJobRuns();
    });
    await t.test("old export success/error cannot overwrite a new owner's object",async()=>{
      await addJob(5,5,false);
      const id="00000000-0000-4000-8000-000000000005";
      await client`insert into admin_exports(id,status,object_key) values(${id},'running','new-owner.csv')`;
      const guard={runId:5,lockToken:"old-token"};
      await assert.rejects(markAdminExportReady({id,objectKey:"old-owner.csv",rowCount:1,fileSize:10},guard),/STALE_SNAPSHOT_JOB/);
      await assert.rejects(markAdminExportFailed(id,"old error",guard),/STALE_SNAPSHOT_JOB/);
      assert.equal((await client`select object_key from admin_exports where id=${id}`)[0].object_key,"new-owner.csv");
      await markAdminExportReady({id,objectKey:"valid-owner.csv",rowCount:1,fileSize:10},{runId:5,lockToken:"token-5"});
      assert.equal((await client`select status from admin_exports where id=${id}`)[0].status,"ready");
    });
    await t.test("additive migrations quarantine historical sends and preserve pending event identity",async()=>{
      await client.unsafe(`create table email_outbox(id int primary key,status text,attempts int,last_error text,updated_at timestamptz);
        insert into email_outbox values(1,'sending',2,null,now()-interval '2 days');
        insert into email_outbox values(2,'pending',0,null,now());
        create table domain_event_outbox(event_id uuid primary key,dispatched_at timestamptz,created_at timestamptz);
        create index domain_event_outbox_pending_idx on domain_event_outbox(created_at) where dispatched_at is null;
        insert into domain_event_outbox values('00000000-0000-4000-8000-000000000001',null,now()-interval '2 days');`);
      for(const file of ["0129_email_outbox_lease","0130_domain_event_recovery_backoff"]) {
        const source=await readFile(`drizzle/${file}.sql`,"utf8");
        for(const statement of source.split("--> statement-breakpoint")) if(statement.trim())await client.unsafe(statement);
      }
      const [legacy]=await client`select id,status,attempts,last_error,lease_token from email_outbox where id=1`;
      assert.equal(legacy.status,"failed");assert.equal(legacy.attempts,2);assert.equal(legacy.lease_token,null);
      assert.match(legacy.last_error,/Исход предыдущей доставки неизвестен/);
      assert.equal((await client`select status from email_outbox where id=2`)[0].status,"pending");
      const [event]=await client`select event_id,dispatched_at,next_attempt_at=created_at as same from domain_event_outbox`;
      assert.equal(event.dispatched_at,null);assert.equal(event.same,true);
    });
  } finally {
    await client.end({timeout:1});await admin.unsafe(`drop schema ${schema} cascade`);await admin.end({timeout:1});
  }
});
