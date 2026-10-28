import assert from "node:assert/strict";
import { test } from "node:test";
import { bookSnapshotRunStatus } from "../src/lib/providers/snapshot-run-status";
import type { BookSnapshotRun } from "../src/db/queries/provider-snapshot-run";

const completed:BookSnapshotRun={id:1,status:'succeeded',payload:{operation:'refresh',mediaItemIds:[42],checkpoint:{afterId:42,throughId:42,processed:1,failed:0,errors:[]}},errorMessage:null,createdAt:new Date(),finishedAt:new Date()};

test('snapshot operation status confirms only a completed single-record result',()=>{
  for(const status of ['queued','running'] as const){
    const shown=bookSnapshotRunStatus({...completed,status});
    assert.equal(shown.active,true);assert.equal(shown.success,false);
  }
  const retry=bookSnapshotRunStatus({...completed,status:'queued',payload:{...completed.payload,checkpoint:{...completed.payload.checkpoint!,retryId:42,retryCount:1}}});
  assert.equal(retry.active,true);assert.match(retry.message,/повторной попытки/);
  for(const status of ['failed','cancelled'] as const){
    const shown=bookSnapshotRunStatus({...completed,status});
    assert.equal(shown.active,false);assert.equal(shown.success,false);
  }
  for(const checkpoint of [undefined,{...completed.payload.checkpoint!,processed:0},{...completed.payload.checkpoint!,processed:2},{...completed.payload.checkpoint!,failed:1}]){
    assert.equal(bookSnapshotRunStatus({...completed,payload:{...completed.payload,checkpoint}}).success,false,'succeeded alone is not proof of applied data');
  }
  const messages=new Set<string>();
  for(const operation of ['refresh','process','refresh-process','verify'] as const){
    const shown=bookSnapshotRunStatus({...completed,payload:{...completed.payload,operation}});
    assert.equal(shown.active,false);assert.equal(shown.success,true);messages.add(shown.message);
    if(operation==='refresh'||operation==='verify')assert.match(shown.message,/не изменялась/);
    else assert.match(shown.message,/применены к записи/);
  }
  assert.equal(messages.size,4,'refresh, apply, combined and verification communicate different results');
});

test("game run success distinguishes checked transfer from explicit application", () => {
  for (const operation of ["process", "refresh-process"] as const) {
    for (const applyGameChanges of [undefined, false]) {
      const shown = bookSnapshotRunStatus({ ...completed, payload: { ...completed.payload, mediaType: "game", operation, applyGameChanges } });
      assert.equal(shown.success, true);
      assert.match(shown.message, /Жанры, платформы и компании не изменялись/);
      assert.doesNotMatch(shown.message, /применены к записи/);
    }
    const explicit = bookSnapshotRunStatus({ ...completed, payload: { ...completed.payload, mediaType: "game", operation, applyGameChanges: true } });
    assert.match(explicit.message, /применены к записи/);
  }
});

test('snapshot run lookup exposes only a valid explicitly selected single record and uses the primary key at scale',{
  skip:process.env.PROVIDER_SNAPSHOT_TEST!=='1',
},async(t)=>{
  await import('dotenv/config');
  const originalUrl=process.env.DATABASE_URL!;
  const {default:postgres}=await import('postgres');
  const admin=postgres(originalUrl,{max:1,prepare:false});
  const schema=`snapshot_run_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url=new URL(originalUrl);url.searchParams.set('options',`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.toString();process.env.DATABASE_MAX_CONNECTIONS='1';
  const {getDbClient}=await import('../src/db');const client=getDbClient();
  try{
    await client.unsafe(`create table job_runs(id integer primary key,type text,status text,payload jsonb,error_message text,created_at timestamptz,finished_at timestamptz);
      insert into job_runs select g,'provider.snapshots','queued',jsonb_build_object('operation','refresh','mediaItemIds',jsonb_build_array(g)),null,now(),null from generate_series(1,100000)g;
      update job_runs set type='media.metadata-backfill' where id=2;
      update job_runs set payload='{"operation":"process","mediaItemIds":[42,43]}' where id=3;
      update job_runs set payload='{"operation":"process"}' where id=4;
      update job_runs set payload='{"operation":"invalid","mediaItemIds":[42]}' where id=5;
      update job_runs set payload='{"operation":"process","mediaItemIds":[42],"checkpoint":{"processed":1}}' where id=6;
      update job_runs set payload='{"entityType":"creator","provider":"fantlab","operation":"process","creatorIds":[42]}' where id=7;
      update job_runs set payload='{"entityType":"creator","provider":"fantlab","operation":"process","creatorIds":[42,43]}' where id=8;
      analyze job_runs`);
    const {getBookSnapshotRun,getCreatorSnapshotRun,getProviderSnapshotRun}=await import('../src/db/queries/provider-snapshot-run');
    const statements:Array<{query:string;params:unknown[]}>=[];
    client.options.debug=(_c,query,params)=>{if(query.trim().startsWith('select'))statements.push({query,params:[...params]});};
    for(const id of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(await getBookSnapshotRun(42,id),null);
    assert.equal(statements.length,0,'invalid run IDs are rejected before a DB round trip');
    for(const id of [2,3,4,5,6,100001])assert.equal(await getBookSnapshotRun(42,id),null);
    assert.equal(await getBookSnapshotRun(43,42),null,'a run for another entry is not exposed');
    assert.deepEqual((await getProviderSnapshotRun(3))!.payload.mediaItemIds,[42,43],'bulk progress can read a valid batch while record pages still reject it');
    assert.equal(await getProviderSnapshotRun(2),null,'progress never reads an unrelated job type');
    assert.equal(await getProviderSnapshotRun(5),null,'malformed snapshot jobs are rejected');
    assert.equal((await getCreatorSnapshotRun(42,7))!.id,7);
    assert.equal(await getCreatorSnapshotRun(43,7),null,"creator page rejects a run for another creator");
    assert.equal(await getCreatorSnapshotRun(42,8),null,"creator page rejects bulk runs");
    assert.equal(await getCreatorSnapshotRun(42,42),null,"creator page rejects a book run with the same numeric id");
    assert.equal(await getBookSnapshotRun(42,7),null,"book page rejects creator runs");
    const own=await getBookSnapshotRun(42,42);
    assert.equal(own!.id,42);assert.deepEqual(own!.payload.mediaItemIds,[42]);
    client.options.debug=false;
    for(const id of [42,99999,100001]){
      statements.length=0;
      client.options.debug=(_c,query,params)=>{if(query.trim().startsWith('select'))statements.push({query,params:[...params]});};
      await getBookSnapshotRun(id,id);client.options.debug=false;
      assert.equal(statements.length,1,'one lookup round trip without list/count scans');
      const {query,params}=statements[0];
      const [explained]=await client.unsafe('explain(analyze,buffers,format json) '+query,params as never[]);
      const plan=explained['QUERY PLAN'][0];
      assert.equal(plan.Plan['Node Type'],'Index Scan');
      assert.equal(plan.Plan['Index Name'],'job_runs_pkey');
      assert.ok(plan.Plan['Actual Rows']<=1);
      t.diagnostic(JSON.stringify({jobRuns:100000,id,executionMs:plan['Execution Time'],index:plan.Plan['Index Name'],rows:plan.Plan['Actual Rows'],loops:plan.Plan['Actual Loops']}));
    }
  }finally{
    client.options.debug=false;await client.end();await admin.unsafe(`drop schema ${schema} cascade`);await admin.end();process.env.DATABASE_URL=originalUrl;
  }
});
