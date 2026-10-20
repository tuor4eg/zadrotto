import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Explicit opt-in. All writes are confined to a disposable schema, never application tables.
test("provider snapshots: raw preservation, CAS, ownership, races and scale", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async (t) => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const originalUrl = process.env.DATABASE_URL!;
  const admin = postgres(originalUrl, { max: 1, prepare: false });
  const schema = `snapshot_test_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { db, getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    const migration = await readFile("drizzle/0127_provider_snapshots.sql", "utf8");
    await client.unsafe(migration.split("ALTER TABLE entry_creator_sources")[0].replaceAll("--> statement-breakpoint", ""));
    await client.unsafe(`create table snapshot_entities(id text primary key); insert into snapshot_entities values ('a'),('b'),('race');
      create table job_runs(id integer primary key,status text,lock_token text,lock_expires_at timestamptz);
      insert into job_runs values(1,'running','live',now()+interval '1 hour'),(2,'running','expired',now()-interval '1 second')`);
    const core = await import("../src/db/queries/provider-snapshots");
    const { registerSnapshotEntityType } = await import("../src/lib/providers/entities");
    const { sql } = await import("drizzle-orm");
    registerSnapshotEntityType("test-document", {
      canonicalId(value) { if (!/^[a-z]+$/.test(value)) throw new Error("INVALID_TEST_ID"); return value; },
      async lock(tx, id) {
        const rows = await tx.execute(sql`select id from snapshot_entities where id=${id} for update`);
        if (!rows.length) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
      },
    });
    const base = { providerCode: "fantlab",resourceType:"work",externalId:"7",apiMethod:"detail",requestParams:{lang:"ru"},
      payload:{ envelope:{ authors:[{id:1,name:"Writer"}],unknown:{future:[null,3,true]} } },contentType:"application/json",payloadHash:"ignored",
      requestStartedAt:new Date("2026-01-01T00:00:01Z"),fetchedAt:new Date("2026-01-01T00:00:02Z") };
    const first = await core.saveProviderSnapshot(base);
    assert.deepEqual(first.payload,base.payload);
    assert.ok((await core.providerRequestStartedAt()) instanceof Date);
    const same = await core.saveProviderSnapshot({...base, requestStartedAt:new Date("2026-01-01T00:00:03Z")});
    assert.equal(same.id,first.id);
    assert.equal(same.payloadHash,first.payloadHash);
    const stale = await core.saveProviderSnapshot({...base,payload:{stale:true}});
    assert.deepEqual(stale.payload,base.payload);
    for (const variant of [{resourceType:"author"},{apiMethod:"search"},{requestParams:{lang:"en"}}]) {
      assert.notEqual((await core.saveProviderSnapshot({...base,...variant})).id,first.id);
    }
    await assert.rejects(core.saveProviderSnapshot({...base,externalId:"guarded"},{runId:2,lockToken:"expired"}),/STALE_SNAPSHOT_JOB/);
    await assert.rejects(core.saveProviderSnapshot({...base,externalId:"guarded"},{runId:1,lockToken:"wrong"}),/STALE_SNAPSHOT_JOB/);
    assert.equal(await core.getProviderSnapshot({...base,externalId:"guarded"}),null);
    await core.saveProviderSnapshot({...base,externalId:"guarded"},{runId:1,lockToken:"live"});
    const ref={id:first.id,payloadHash:first.payloadHash,purpose:"primary" as const};
    const entity=(id:string)=>({entityType:"test-document",entityId:id});
    await db.transaction(tx=>core.attachProviderSnapshots(tx,entity("a"),[ref],{kind:"system"}));
    await db.transaction(tx=>core.attachProviderSnapshots(tx,entity("a"),[ref],{kind:"system"}));
    assert.equal((await core.getEntitySnapshotHeaders(entity("a"))).length,1);
    await assert.rejects(db.transaction(tx=>core.attachProviderSnapshots(tx,{entityType:"unknown",entityId:"a"},[ref],{kind:"system"})),/UNKNOWN_SNAPSHOT_ENTITY_TYPE/);
    await assert.rejects(db.transaction(tx=>core.attachProviderSnapshots(tx,entity("../invalid"),[ref],{kind:"system"})),/INVALID_TEST_ID/);
    await assert.rejects(db.transaction(tx=>core.attachProviderSnapshots(tx,entity("missing"),[ref],{kind:"system"})),/SNAPSHOT_ENTITY_NOT_FOUND/);
    await db.transaction(tx=>core.moveEntitySnapshotLinks(tx,entity("a"),entity("b")));
    assert.deepEqual(await core.getEntitySnapshotHeaders(entity("a")),[]);
    assert.equal((await core.getEntitySnapshotHeaders(entity("b"))).length,1);
    const changed = await core.saveProviderSnapshot({...base,payload:{changed:true},requestStartedAt:new Date("2026-01-01T00:00:04Z")});
    await assert.rejects(db.transaction(tx=>core.lockProviderSnapshotReferences(tx,[ref])),/PROVIDER_SNAPSHOT_CHANGED/);
    await assert.rejects(db.transaction(tx=>core.attachProviderSnapshots(tx,entity("a"),[ref],{kind:"system"})),/PROVIDER_SNAPSHOT_CHANGED/);
    assert.deepEqual(await core.getEntitySnapshotHeaders(entity("a")),[],"failed attachment rolls back completely");
    const currentRef={...ref,payloadHash:changed.payloadHash};
    let release!:()=>void;
    let locked!:()=>void;
    const acquired=new Promise<void>(resolve=>{locked=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const deletion=db.transaction(async tx=>{
      await core.deleteEntitySnapshotLinks(tx,entity("race"));
      locked(); await gate;
      await tx.execute(sql`delete from snapshot_entities where id='race'`);
    });
    await acquired;
    const attachment=db.transaction(tx=>core.attachProviderSnapshots(tx,entity("race"),[currentRef],{kind:"system"}));
    release(); await deletion;
    await assert.rejects(attachment,/SNAPSHOT_ENTITY_NOT_FOUND/);
    assert.deepEqual(await core.getEntitySnapshotHeaders(entity("race")),[]);

    await client.unsafe(`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
      select 'scale','work',g::text,'detail','{}',g::text,jsonb_build_object('padding',repeat('x',512)),'application/json',repeat('a',64),now(),now() from generate_series(1,100000)g;
      insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose)
      select id,'scale',case when n=1 then 'common' when n=2 then (id%10000)::text else 'unique-'||id end,'dependency'
      from provider_snapshots cross join generate_series(1,3)n where provider_code='scale';
      analyze provider_snapshots; analyze provider_snapshot_links;`);
    const statements:Array<{query:string;params:unknown[]}>=[];
    for(const id of ["common","unique-50000","absent"]) {
      client.options.debug=(_c,query,params)=>{if(query.trim().startsWith("select"))statements.push({query,params});};
      await core.getEntitySnapshotHeaders({entityType:"test-document",entityId:id === "common" ? "a" : "b"});
      client.options.debug=false;
      const query=statements.pop()!;
      // Same generated SQL and parameter types, with scale entity and representative fan-out.
      const params=[...query.params]; params[0]="scale";params[1]=id;
      const [row]=await client.unsafe("explain(analyze,buffers,format json) "+query.query,params as never[]);
      const plan=row["QUERY PLAN"][0];
      const nodes:Array<Record<string,unknown>>=[];
      const walk=(node:Record<string,unknown>)=>{
        nodes.push({type:node["Node Type"],index:node["Index Name"],rows:node["Actual Rows"],loops:node["Actual Loops"],sort:node["Sort Method"]});
        for(const child of (node.Plans??[]) as Array<Record<string,unknown>>)walk(child);
      };
      walk(plan.Plan);
      t.diagnostic(JSON.stringify({scaleSnapshots:100000,scaleLinks:300000,entity:id,executionMs:plan["Execution Time"],nodes}));
      assert.ok(!query.query.includes('"payload"'),"header reads never fetch raw JSON");
      if(id!=="common") assert.ok(JSON.stringify(plan).includes("provider_snapshot_links_entity_idx"),"selective lookup uses entity index");
    }
    const [writePlan]=await client.unsafe("explain(format json) update provider_snapshots set fetched_at=now() where provider_code='scale' and resource_type='work' and external_id='50000' and api_method='detail' and request_key='50000'");
    assert.ok(JSON.stringify(writePlan).includes("provider_snapshots_identity_unique"));
    statements.length=0;
    client.options.debug=(_c,query,params)=>{if(query.trim().startsWith("insert"))statements.push({query,params});};
    await core.saveProviderSnapshot({...base,externalId:"explain-write"});
    client.options.debug=false;
    const mutation=statements[0];
    const [insertPlan]=await client.unsafe("explain(format json) "+mutation.query,mutation.params as never[]);
    assert.ok(JSON.stringify(insertPlan).includes("provider_snapshots_identity_unique"),"actual UPSERT uses identity conflict arbiter");
  } finally {
    client.options.debug=false;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL=originalUrl;
  }
});
