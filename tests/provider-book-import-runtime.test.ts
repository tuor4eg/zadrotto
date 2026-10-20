import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { DbTransaction } from "../src/db/transaction";

// No real APIs, migration against application tables, or shared-sequence writes.
test("book import preserves raw answers and manual decisions across offline replay and cutover",{skip:process.env.PROVIDER_SNAPSHOT_TEST!=="1"},async(t)=>{
  await import("dotenv/config");
  const {default:postgres}=await import("postgres");
  const original=process.env.DATABASE_URL!;
  const admin=postgres(original,{max:1,prepare:false});
  const schema=`book_import_${process.pid}_${Date.now()}`;
  const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
  await admin.unsafe(`create schema ${schema}`);
  const url=new URL(original);url.searchParams.set("options",`-c search_path=${schema},public`);
  process.env.DATABASE_URL=url.toString();process.env.DATABASE_MAX_CONNECTIONS="1";
  const {getDbClient}=await import("../src/db");const client=getDbClient();
  const originalFetch=globalThis.fetch;
  try {
    const tables=await admin`select tablename from pg_tables where schemaname='public'`;
    for(const {tablename} of tables) await client.unsafe(`create table ${quote(tablename)} (like public.${quote(tablename)} including defaults including constraints including indexes)`);
    // LIKE copies nextval defaults pointing at public. Replace every one before any insertion.
    const serials=await client`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for(const [i,column] of serials.entries()) {
      await client.unsafe(`create sequence ${schema}.test_serial_${i} start 1000000`);
      await client.unsafe(`alter table ${quote(column.table_name)} alter column ${quote(column.column_name)} set default nextval('${schema}.test_serial_${i}')`);
    }
    if(!tables.some(row=>row.tablename==='provider_snapshots')) {
      const migration=await readFile("drizzle/0127_provider_snapshots.sql","utf8");
      for(const statement of migration.split('--> statement-breakpoint'))await client.unsafe(statement);
    }
    const [flagColumn]=await client`select 1 from information_schema.columns where table_schema=${schema} and table_name='provider_settings' and column_name='normalized_book_metadata'`;
    if(flagColumn)await client.unsafe('alter table provider_settings drop column normalized_book_metadata');
    await client.unsafe(`insert into provider_settings(media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority) values('book','google-books',false,'fallback',false,71),('film','fantlab',false,'off',false,99)`);
    for(const statement of (await readFile("drizzle/0128_book_provider_cutover_settings.sql","utf8")).split('--> statement-breakpoint'))await client.unsafe(statement);
    const networkSettings=await client`select media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority,normalized_book_metadata from provider_settings order by media_type,provider_code`;
    assert.deepEqual([...networkSettings],[
      {media_type:'book',provider_code:'fantlab',enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:30,normalized_book_metadata:false},
      {media_type:'book',provider_code:'google-books',enabled:false,title_search_mode:'fallback',cover_search_enabled:false,priority:71,normalized_book_metadata:false},
      {media_type:'book',provider_code:'open-library',enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:10,normalized_book_metadata:false},
      {media_type:'film',provider_code:'fantlab',enabled:false,title_search_mode:'off',cover_search_enabled:false,priority:99,normalized_book_metadata:false},
    ],'migration preserves existing settings and seeds absent providers with runtime defaults');
    await client`delete from provider_settings where media_type='book' and provider_code='google-books'`;
    await client.unsafe((await readFile('drizzle/0128_book_provider_cutover_settings.sql','utf8')).split('--> statement-breakpoint')[1]);
    const [googleDefault]=await client`select enabled,title_search_mode,cover_search_enabled,priority,normalized_book_metadata from provider_settings where media_type='book' and provider_code='google-books'`;
    assert.deepEqual(googleDefault,{enabled:true,title_search_mode:'parallel',cover_search_enabled:true,priority:20,normalized_book_metadata:false});
    for(const table of ['media_types','creator_types','creator_roles'])await client.unsafe(`insert into ${quote(table)} select * from public.${quote(table)}`);
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) values(1,'test-book','Ручное название','book','published');
      insert into creators(id,name,slug,type_id) select v.id,v.name,v.slug,t.id from (values(1,'Manual','manual'),(2,'Second','second'),(3,'First','first')) v(id,name,slug) cross join creator_types t where t.code='person';
      insert into entry_creators(entry_id,creator_id,role_id,is_manual) select 1,1,id,true from creator_roles where code='writer';
      insert into provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) values('google-books','book','Second','second',2),('google-books','book','First','first',3);`);
    const service=await import('../src/lib/providers/book-service');
    const {upsertMediaItemMetadata,getMediaItemMetadata}=await import('../src/db/queries/media-item-metadata');
    let calls=0,budgets=0;
    globalThis.fetch=async()=>{calls++;return Response.json({id:'volume1',future:{unknown:[true,4]},volumeInfo:{title:'API title',authors:['Second','First'],publishedDate:'2020-03-04'}});};
    const preview=await service.fetchBookMetadata({provider:'google-books',externalId:'volume1',mediaType:'book'},{candidateLimit:1,tmdbResultScanLimit:1,beforeProviderSearch:async()=>{budgets++;return true;}});
    assert.equal(calls,1);assert.equal(budgets,1);assert.equal(preview.snapshotReferences!.length,1);
    const base={mediaItemId:1,facts:preview.facts,sourceProvider:'google-books',sourceExternalId:'volume1',snapshotReferences:preview.snapshotReferences};
    await upsertMediaItemMetadata(base);
    assert.deepEqual((await client`select payload from provider_snapshots`)[0].payload.future,{unknown:[true,4]});
    const before=(await client`select facts from media_item_metadata where media_item_id=1`)[0].facts;
    globalThis.fetch=async()=>{throw new Error('OFFLINE_REPLAY_MUST_NOT_FETCH');};
    const saved=await service.getSavedBookBundle('google-books','volume1');
    assert.deepEqual(saved.projection.contributors.map(value=>value.name),['Second','First']);
    await client.unsafe(`insert into provider_settings(media_type,provider_code,normalized_book_metadata) values('book','google-books',false) on conflict(media_type,provider_code) do update set normalized_book_metadata=false`);
    const {enableNormalizedBookProvider,getNormalizedBookProviders,isNormalizedBookProvider}=await import('../src/lib/providers/book-cutover');
    assert.deepEqual(await getNormalizedBookProviders(),[]);
    assert.equal(await isNormalizedBookProvider('google-books'),false);
    await client`update media_item_metadata set facts=facts||'{"unmigrated":"preserve"}'::jsonb where media_item_id=1`;
    const blocked=await enableNormalizedBookProvider('google-books',1);
    assert.equal(blocked.enabled,false);
    assert.ok(blocked.report?.issues.some(issue=>issue.code==='UNMIGRATED_LEGACY_FIELD'));
    assert.equal(await isNormalizedBookProvider('google-books'),false,'audit failure does not enable provider');
    await client`update media_item_metadata set facts=facts-'unmigrated' where media_item_id=1`;
    assert.equal((await enableNormalizedBookProvider('google-books',1)).enabled,true);
    assert.deepEqual(await enableNormalizedBookProvider('google-books',1),{enabled:true,report:null});
    assert.deepEqual(await getNormalizedBookProviders(),['google-books']);
    assert.equal(await isNormalizedBookProvider('google-books'),true,'setting becomes visible immediately without process restart');
    const settingQueries:Array<{query:string;params:unknown[]}>=[];
    client.options.debug=(_c,query,params)=>{if(query.trim().startsWith('select'))settingQueries.push({query,params:[...params]});};
    await getNormalizedBookProviders();await isNormalizedBookProvider('google-books');
    client.options.debug=false;
    for(const {query,params} of settingQueries){
      // postgres-js debug exposes encoded booleans; rebinding those as strings changes their meaning.
      if(query.includes('"normalized_book_metadata" ='))params[params.length-1]=true;
      const [explained]=await client.unsafe('explain(analyze,buffers,format json) '+query,params as never[]);
      t.diagnostic(JSON.stringify({settingRead:true,plan:explained['QUERY PLAN']}));
      assert.match(JSON.stringify(explained),/provider_settings/);
    }
    const [updatePlan]=await client.unsafe("explain(format json) update provider_settings set normalized_book_metadata=true where media_type='book' and provider_code='google-books'");
    assert.match(JSON.stringify(updatePlan),/provider_settings/);
    await upsertMediaItemMetadata({...base,facts:{authors:['UNTRUSTED'],extra:'must not replace legacy'},expectedSource:{provider:'google-books',externalId:'volume1'}});
    assert.deepEqual((await client`select facts from media_item_metadata where media_item_id=1`)[0].facts,before,'legacy facts freeze at cutover');
    assert.equal((await client`select title from media_items where id=1`)[0].title,'Ручное название');
    assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1 and creator_id=1 and is_manual`)[0].n,1);
    assert.deepEqual((await client`select creator_id from entry_creator_sources where entry_id=1 order by source_position`).map(row=>row.creator_id),[2,3]);
    const reads:string[]=[];
    client.options.debug=(_c,query)=>{reads.push(query);};
    const rendered=await getMediaItemMetadata(1);
    client.options.debug=false;
    assert.deepEqual(rendered!.writerCreators!.map(value=>value.name),['Second','First']);
    assert.ok(reads.every(query=>!query.includes('provider_snapshots')),'normal metadata reads do not load raw snapshots');
    await assert.rejects(upsertMediaItemMetadata({...base,expectedSource:{provider:'google-books',externalId:'other'}}),/PROVIDER_SOURCE_CHANGED/);
    await assert.rejects(upsertMediaItemMetadata({...base,snapshotReferences:preview.snapshotReferences!.map(ref=>({...ref,payloadHash:'0'.repeat(64)}))}),/PROVIDER_SNAPSHOT_CHANGED/);
    await client.unsafe(`insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values(1,'provider.snapshots','manual','running','active',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    await upsertMediaItemMetadata({...base,jobGuard:{runId:1,lockToken:'active'},checkpoint:{done:1}});
    assert.deepEqual((await client`select payload from job_runs where id=1`)[0].payload,{done:1});
    await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=1`;
    await assert.rejects(upsertMediaItemMetadata({...base,jobGuard:{runId:1,lockToken:'active'},checkpoint:{done:2}}),/STALE_SNAPSHOT_JOB/);
    assert.deepEqual((await client`select payload from job_runs where id=1`)[0].payload,{done:1});
    assert.equal(calls,1);

    // A form's row write and metadata proof must commit or roll back together.
    const {createAdminMediaItem,updateAdminMediaItem,updateAuthorMediaItem}=await import('../src/db/queries/media-items');
    const {createAuthorPrivateMediaItemWithLimitCheck}=await import('../src/db/operations/author-media-items');
    const form={authorId:1,code:'atomic-admin',title:'Atomic book',originalTitle:null,description:null,mediaType:'book' as const,
      franchiseIds:[],mediaCarrierId:null,releaseYear:null,coverUrl:null,coverThumbUrl:null,
      coverSource:{provider:null,externalId:null,pageUrl:null}};
    const staleRefs=preview.snapshotReferences!.map(ref=>({...ref,payloadHash:'0'.repeat(64)}));
    const afterWrite=(stale:boolean)=>async(tx:DbTransaction,mediaItemId:number)=>{
      await upsertMediaItemMetadata({...base,mediaItemId,snapshotReferences:stale?staleRefs:preview.snapshotReferences},tx);
    };
    await assert.rejects(createAdminMediaItem({...form,afterWrite:afterWrite(true)}),/PROVIDER_SNAPSHOT_CHANGED/);
    assert.equal((await client`select count(*)::int n from media_items where code='atomic-admin'`)[0].n,0,'admin insert rolls back with stale proof');
    await createAdminMediaItem({...form,afterWrite:afterWrite(false)});
    const [adminItem]=await client`select id from media_items where code='atomic-admin'`;
    await assert.rejects(updateAdminMediaItem({...form,mediaItemId:adminItem.id,title:'Stale update',afterWrite:afterWrite(true)}),/PROVIDER_SNAPSHOT_CHANGED/);
    assert.equal((await client`select title from media_items where id=${adminItem.id}`)[0].title,'Atomic book');
    await updateAdminMediaItem({...form,mediaItemId:adminItem.id,title:'Valid update',afterWrite:afterWrite(false)});
    assert.equal((await client`select title from media_items where id=${adminItem.id}`)[0].title,'Valid update');

    const privateForm={...form,code:'atomic-author',authorCreationRequestId:'atomic-request',limits:{maxDraftMediaItems:null,maxDraftMediaItemsPerDay:null}};
    await assert.rejects(createAuthorPrivateMediaItemWithLimitCheck({...privateForm,afterWrite:afterWrite(true)}),/PROVIDER_SNAPSHOT_CHANGED/);
    assert.equal((await client`select count(*)::int n from media_items where author_creation_request_id='atomic-request'`)[0].n,0,'failed proof does not consume author request ID');
    const created=await createAuthorPrivateMediaItemWithLimitCheck({...privateForm,afterWrite:afterWrite(false)});
    assert.ok(created.ok && created.created,'the same request ID succeeds with fresh proof');
    if(!created.ok)throw new Error('Expected successful private creation');
    await assert.rejects(updateAuthorMediaItem({...form,mediaItemId:created.item.id,title:'Stale author update',afterWrite:afterWrite(true)}),/PROVIDER_SNAPSHOT_CHANGED/);
    assert.equal((await client`select title from media_items where id=${created.item.id}`)[0].title,'Atomic book');
    await updateAuthorMediaItem({...form,mediaItemId:created.item.id,title:'Valid author update',afterWrite:afterWrite(false)});
    assert.equal((await client`select title from media_items where id=${created.item.id}`)[0].title,'Valid author update');
    // Configurable batches persist their cursor, defer through the job infrastructure,
    // and finish immediately when the final batch is exactly full.
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) select g,'batch-'||g,'Batch '||g,'book','published' from generate_series(200,203)g;
      insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) select g,'google-books','volume1','{}' from generate_series(200,203)g;
      insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(99,'provider.snapshots','manual','running','batch-token',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    const {providerSnapshotJobHandler}=await import('../src/lib/providers/snapshot-job');
    const {parseSnapshotJobPayload}=await import('../src/lib/providers/snapshot-job-payload');
    const {JobError}=await import('../src/lib/jobs/types');
    const batchPayload=parseSnapshotJobPayload({operation:'process',provider:'google-books',afterId:199,throughId:203,batchSize:2,batchPauseHours:1.5});
    const context={runId:99,lockToken:'batch-token',jobId:null,attempt:1,source:'manual' as const,signal:new AbortController().signal};
    await assert.rejects(providerSnapshotJobHandler.execute({...context,payload:batchPayload}), (error:unknown)=>error instanceof JobError && error.code==='provider-continue' && error.deferSeconds===5400);
    const [firstBatch]=await client`select payload from job_runs where id=99`;
    assert.equal(firstBatch.payload.checkpoint.processed,2);assert.equal(firstBatch.payload.checkpoint.afterId,201);
    assert.equal(firstBatch.payload.batchSize,2);assert.equal(firstBatch.payload.batchPauseHours,1.5);
    await providerSnapshotJobHandler.execute({...context,payload:parseSnapshotJobPayload(firstBatch.payload)});
    const [lastBatch]=await client`select payload from job_runs where id=99`;
    assert.equal(lastBatch.payload.checkpoint.processed,4);assert.equal(lastBatch.payload.checkpoint.failed,0);assert.equal(lastBatch.payload.checkpoint.afterId,203);
    assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id between 200 and 203`)[0].n,8);
    assert.equal(calls,1,'offline batch processing never requests the provider');
  } finally {
    client.options.debug=false;
    globalThis.fetch=originalFetch;
    await client.end();await admin.unsafe(`drop schema ${schema} cascade`);await admin.end();process.env.DATABASE_URL=original;
  }
});
