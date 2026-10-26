import postgres from "postgres";
import test from "node:test";
import assert from "node:assert/strict";
test("localization batch persistence, source priorities, lease fencing and indexed scale", { skip: !process.env.CREATOR_LOCALIZATION_TEST_DATABASE_URL }, async () => {
  const url = process.env.CREATOR_LOCALIZATION_TEST_DATABASE_URL!;
  const schema = `localization_runtime_${process.pid}_${Date.now()}`;
  process.env.DATABASE_URL = url + (url.includes("?") ? "&" : "?") + "options=-csearch_path%3D" + schema;
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => undefined });
  let dbModule: typeof import("../src/db") | undefined;
  await sql.unsafe(`create schema "${schema}"`);
  try {
    await sql.unsafe(`set search_path="${schema}"`);
    await sql `create table admin_activity_logs(id serial primary key, action text, actor_type text, admin_user_id int, author_id int, ip_address text, user_agent text, entity_type text, entity_id int, entity_label text, status text, severity text, message text, metadata jsonb, created_at timestamptz default now())`;
    await sql `create table creator_types(id serial primary key, code text)`;
    await sql `create table creators(id serial primary key,name text,slug text,original_name text,name_ru text,name_ru_source text,name_ru_processed boolean default false,type_id int, birth_date date,death_date date,avatar_object_key text,avatar_source text,avatar_source_external_id text,avatar_source_url text,avatar_original_url text,avatar_fetched_at timestamptz,avatar_content_hash text,avatar_version int default 0,created_at timestamptz default now(), updated_at timestamptz default now())`;
    await sql `create table job_runs(id serial primary key, payload jsonb, status text,lock_token text,lock_expires_at timestamptz,type text default 'media.creator-name-localization')`;
    await sql `create unique index active_run on job_runs(type) where type='media.creator-name-localization' and status in ('queued','running')`;
    await sql `create table creator_roles(id int primary key,name text)`;
    await sql `create table media_items(id int primary key,title text)`;
    await sql `create table entry_creators(creator_id int,role_id int,entry_id int)`;
    await sql `create index pending on creators(type_id,id) where name_ru_processed=false and (name_ru_source is null or name_ru_source='ai')`;
    await sql `create index ec on entry_creators(creator_id,role_id,entry_id)`;
    await sql `insert into creator_types values (1,'person'),(2,'organization')`;
    await sql `insert into creators(id,name,name_ru,name_ru_source,type_id) values (1,'John','Джон','ai',1),(2,'Jane',null,'manual',1),(3,'Jack','Джек','provider',1),(4,'Company',null,null,2),(5,'Bob',null,null,1),(6,'Иван',null,null,1)`;
    await sql `insert into job_runs(id,payload,status,lock_token,lock_expires_at) values(1,'{}','running','lease',now()+interval '5 minutes')`;
    const competingRuns = await Promise.allSettled([
      sql `insert into job_runs(id,payload,status) values(2,'{}','queued')`,
      sql `insert into job_runs(id,payload,status) values(3,'{}','running')`
    ]);
    assert.equal(competingRuns.filter(result => result.status === 'rejected').length, 2);
    const q = await import("../src/db/queries/creator-name-localization");
    const db = await import("../src/db");
    dbModule = db;
    const guard = { runId: 1, lockToken: 'lease' }, payload = { batchSize: 20, requestsPerMinute: 5, requestsPerDay: 200 };
    const batch = await q.prepareCreatorNameLocalizationBatch(payload, guard);
    assert.deepEqual(batch.map(x => x.id), [1, 5]);
    assert.equal((await sql `select name_ru_processed from creators where id=6`)[0].name_ru_processed, true);
    assert.deepEqual((await sql `select payload from job_runs`)[0].payload.creatorIds, [1, 5]);
    await q.saveCreatorNameLocalizationBatch({ guard, expected: batch, response: { persons: [{ id: 1, nameRu: null }, { id: 5, nameRu: 'Боб' }] } });
    assert.deepEqual((await sql `select name_ru,name_ru_source,name_ru_processed from creators where id=1`)[0], { name_ru: 'Джон', name_ru_source: 'ai', name_ru_processed: true });
    const [firstLog] = await sql `select action,actor_type,entity_type,entity_id,entity_label,message,metadata from admin_activity_logs`;
    assert.equal(firstLog.action, 'creator.name-localized');
    assert.equal(firstLog.actor_type, 'system');
    assert.equal(firstLog.entity_type, 'creator');
    assert.equal(firstLog.entity_id, 5);
    assert.equal(firstLog.entity_label, 'Боб');
    assert.match(firstLog.message, /«Bob» → «Боб»/);
    assert.deepEqual(firstLog.metadata, { source: 'ai', runId: 1, originalName: 'Bob', previousName: 'Bob', nameRu: 'Боб' });
    await q.saveCreatorNameLocalizationBatch({ guard, expected: batch, response: { persons: [{ id: 1, nameRu: null }, { id: 5, nameRu: 'Боб' }] } });
    assert.equal((await sql `select count(*)::int n from admin_activity_logs`)[0].n, 1, 'replay and unchanged/null names do not create audit entries');
    assert.deepEqual((await q.resetCreatorNameLocalization([1, 2, 3, 4, 5])).map(x => x.id), [1, 5]);
    const next = await q.prepareCreatorNameLocalizationBatch(payload, guard);
    await sql `update creators set name_ru='Ручное',name_ru_source='manual',updated_at=clock_timestamp() where id=5`;
    await q.saveCreatorNameLocalizationBatch({ guard, expected: next, response: { persons: [{ id: 1, nameRu: 'Джонни' }, { id: 5, nameRu: 'Роберт' }] } });
    assert.equal((await sql `select name_ru from creators where id=5`)[0].name_ru, 'Ручное');
    const changedLogs = await sql `select entity_id,metadata from admin_activity_logs order by id`;
    assert.deepEqual(changedLogs.map(log => log.entity_id), [5, 1], 'concurrent manual edits are not logged as successful localization');
    assert.equal(changedLogs[1].metadata.previousName, 'Джон');
    assert.equal(changedLogs[1].metadata.nameRu, 'Джонни');
    await q.resetCreatorNameLocalization([1]);
    const unchangedBatch = await q.prepareCreatorNameLocalizationBatch(payload, guard);
    await q.saveCreatorNameLocalizationBatch({ guard, expected: unchangedBatch, response: { persons: unchangedBatch.map(row => ({ id: row.id, nameRu: 'Джонни' })) } });
    assert.equal((await sql `select count(*)::int n from admin_activity_logs`)[0].n, 2, 'an identical localized name is not logged');
    await q.resetCreatorNameLocalization([1]);
    const rollbackBatch = await q.prepareCreatorNameLocalizationBatch(payload, guard);
    await sql `alter table admin_activity_logs add constraint reject_localization_log check (action <> 'creator.name-localized') not valid`;
    await assert.rejects(q.saveCreatorNameLocalizationBatch({ guard, expected: rollbackBatch, response: { persons: rollbackBatch.map(row => ({ id: row.id, nameRu: 'Джонатан' })) } }));
    assert.equal((await sql `select name_ru from creators where id=1`)[0].name_ru, 'Джонни', 'audit failure rolls back the name update');
    assert.equal((await sql `select name_ru_processed from creators where id=1`)[0].name_ru_processed, false);
    await sql `alter table admin_activity_logs drop constraint reject_localization_log`;
    await assert.rejects(() => q.prepareCreatorNameLocalizationBatch(payload, { runId: 1, lockToken: 'stale' }));
    await sql `update job_runs set lock_expires_at=now()-interval '1 second'`;
    await assert.rejects(() => q.saveCreatorNameLocalizationBatch({ guard, expected: next, response: { persons: [{ id: 1, nameRu: 'Неверно' }, { id: 5, nameRu: null }] } }));
    if (process.env.CREATOR_LOCALIZATION_TEST_SCALE === "1") {
      await sql `insert into creators(id,name,type_id) select n,'Person '||n,1 from generate_series(100,100099) n`;
      await sql `insert into creator_roles values(1,'Автор')`;
      await sql `insert into media_items select n,'Work '||n from generate_series(1,100) n`;
      await sql `insert into entry_creators select c,1,m from generate_series(100,100099) c cross join generate_series(1,10) m`;
      await sql `analyze creators`;
      await sql `analyze entry_creators`;
      await sql `analyze creator_types`;
      await sql `analyze media_items`;
      for (const query of ["select id,name from creators where type_id=(select id from creator_types where code='person') and name_ru_processed=false and (name_ru_source is null or name_ru_source='ai') order by id limit 20", "select c.id,ctx.role,ctx.title from creators c cross join lateral(select r.name role,m.title from entry_creators ec join creator_roles r on r.id=ec.role_id join media_items m on m.id=ec.entry_id where ec.creator_id=c.id order by ec.role_id,ec.entry_id limit 3) ctx where c.id in (100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119)"]) {
        console.log((await sql.unsafe('explain(analyze,buffers) ' + query)).map(r => r['QUERY PLAN']).join('\n'));
      }
      assert.equal((await q.getCreatorNameLocalizationContext([100, 101])).length, 6);
      const pendingQuery = "select id,name from creators where type_id=(select id from creator_types where code='person') and name_ru_processed=false and (name_ru_source is null or name_ru_source='ai') order by id limit 20";
      for (const phase of ['rare', 'absent']) {
        if (phase === 'rare')
          await sql `update creators set name_ru_processed=true where id<100090`;
        else
          await sql `update creators set name_ru_processed=true`;
        await sql `analyze creators`;
        console.log(phase, (await sql.unsafe('explain(analyze,buffers) ' + pendingQuery)).map(r => r['QUERY PLAN']).join('\n'));
      }
      console.log((await sql.unsafe("explain update creators set name_ru_processed=true where id in(100,101,102)")).map(r => r['QUERY PLAN']).join('\n'));
      console.log('Runtime assertions passed; 100000 creators, 1000000 relationships');
    }
  }
  finally {
    await dbModule?.dbClient.end();
    await sql.unsafe(`drop schema if exists "${schema}" cascade`);
    await sql.end();
  }
});
