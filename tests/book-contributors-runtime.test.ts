import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("FantLab typed contributor identity, moderation, order and manual safety", {skip:process.env.PROVIDER_SNAPSHOT_TEST!=="1"}, async t => {
  await import("dotenv/config");
  const schema=`book_contributors_${process.pid}_${Date.now()}`;
  const url=new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options",`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.toString();
  const {getDbClient,db}=await import("../src/db");
  const client=getDbClient();
  const helper=await import("../src/db/queries/book-contributors");
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text);
      INSERT INTO media_items VALUES(1,'one','Один','book','published'),(2,'two','Два','book','published'),(3,'three','Три','book','published'),(4,'four','Четыре','book','draft'),(5,'five','Пять','book','published');
      ALTER TABLE media_items ADD COLUMN original_title text,ADD COLUMN description text,ADD COLUMN media_carrier_id integer,ADD COLUMN release_year integer,
        ADD COLUMN cover_url text,ADD COLUMN cover_thumb_url text,ADD COLUMN cover_thumb_attempted_at timestamptz,ADD COLUMN metadata_attempted_at timestamptz,
        ADD COLUMN shikimori_enrichment_attempted_at timestamptz,ADD COLUMN metadata_issue_code text,ADD COLUMN cover_source_provider text,
        ADD COLUMN cover_source_external_id text,ADD COLUMN cover_source_page_url text,ADD COLUMN author_creation_request_id integer,
        ADD COLUMN created_by_author_id integer,ADD COLUMN moderation_revision integer,ADD COLUMN created_at timestamptz DEFAULT now(),
        ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN submitted_at timestamptz,ADD COLUMN reviewed_by_admin_id integer,
        ADD COLUMN reviewed_at timestamptz,ADD COLUMN admin_note text;
      CREATE TABLE franchises(id integer PRIMARY KEY,code text,title text,publication_status text);
      INSERT INTO franchises VALUES(1,'related','Связанная серия','published'),(2,'private','Скрытая серия','draft');
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id),facts jsonb NOT NULL DEFAULT '{}',source_provider text,
        source_external_id text,source_url text,fetched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE admin_activity_logs(id serial PRIMARY KEY,created_at timestamptz DEFAULT now(),actor_type text,admin_user_id integer,
        author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id integer,retry_of_run_id integer,created_by_admin_id integer,type text,payload jsonb DEFAULT '{}',
        source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts integer DEFAULT 0,max_attempts integer,
        timeout_seconds integer,retry_base_seconds integer,retry_max_seconds integer,locked_at timestamptz,locked_by text,lock_token text,
        lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql", "drizzle/0127_provider_snapshots.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`ALTER TABLE creators ADD COLUMN birth_date date,ADD COLUMN death_date date;
      CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await client.unsafe(`insert into creators(id,name,slug,type_id) select 100,'Ручной','manual',id from creator_types where code='person';
      insert into entry_creators(entry_id,creator_id,role_id,is_manual) select 1,100,id,true from creator_roles where code='writer';`);
    const refs=[{name:"Одно имя",externalId:"101",roleCode:"writer" as const,position:1},{name:"Одно имя",externalId:"102",roleCode:"writer" as const,position:0}];
    const sync=()=>db.transaction(tx=>helper.syncFantlabBookContributors(tx,1,refs));
    await sync();
    assert.equal((await client`select count(*)::int n from creator_requests`)[0].n,2);
    assert.equal((await client`select count(*)::int n from domain_events`)[0].n,2);
    await sync();
    assert.equal((await client`select count(*)::int n from domain_events`)[0].n,2,"idempotent detection");
    const requests=await client`select id, external_creator_id as "externalCreatorId", external_creator_name as "externalCreatorName", normalized_external_creator_name as "normalizedExternalCreatorName" from creator_requests order by external_creator_id`;
    await db.transaction(tx=>helper.resolveFantlabBookRequest(tx,requests[0] as never,{decision:"create",name:"Первый"}));
    await sync();
    const [first]=await client`select * from provider_creator_bindings where external_creator_id='101' and active`;
    await db.transaction(tx=>helper.resolveFantlabBookRequest(tx,requests[1] as never,{decision:"create",name:"Второй"}));
    await sync();
    const ordered=await client`select c.name,s.source_position from entry_creator_sources s join creators c on c.id=s.creator_id order by s.source_position`;
    assert.deepEqual(ordered.map(x=>x.name),["Второй","Первый"]);
    assert.deepEqual((await client`select source_position from creator_request_media_items order by source_position`).map(x=>x.source_position),[0,1],"pending and approved occurrence positions survive");
    assert.equal((await client`select count(*)::int n from entry_creators where creator_id=100 and is_manual`)[0].n,1);
    await db.transaction(tx=>helper.resolveFantlabBookRequest(tx,requests[0] as never,{decision:"exclude"}));
    await sync();
    assert.equal((await client`select count(*)::int n from entry_creator_sources where binding_id=${first.id}`)[0].n,0);
    assert.equal((await client`select count(*)::int n from entry_creator_sources s join provider_creator_bindings b on b.id=s.binding_id where b.external_creator_id='102'`)[0].n,1,"same-name second identity remains linked");
    assert.equal((await client`select count(*)::int n from entry_creators where creator_id=100 and is_manual`)[0].n,1);
    const moderation=await import("../src/db/queries/creator-requests");
    const [second]=await client`select id from provider_creator_bindings where external_creator_id='102' and active`;
    await moderation.reopenCreatorBinding({bindingId:second.id,adminId:1});
    await sync();
    assert.equal((await client`select count(*)::int n from entry_creator_sources`)[0].n,0,"reopened identity is suppressed");
    // NULL identity is cautious and cannot erase an unrelated old link.
    await client`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) select 1,100,id,'fantlab','historic' from creator_roles where code='writer'`;
    await db.transaction(tx=>helper.syncFantlabBookContributors(tx,1,[{name:"Текстовый автор",externalId:null,roleCode:"writer",position:0}]));
    assert.equal((await client`select count(*)::int n from entry_creator_sources where normalized_external_creator_name='historic'`)[0].n,1);
    await db.transaction(tx=>helper.syncFantlabBookContributors(tx,1,[...refs,{name:"Издатель",externalId:null,roleCode:"publisher",position:0}]));
    const [publisher]=await client`select id from creator_requests where external_creator_name='Издатель' and external_creator_id is null`;
    const {saveProviderSnapshot,providerRequestStartedAt}=await import("../src/db/queries/provider-snapshots");
    const {describeBookSource}=await import("../src/lib/providers/book-adapters");
    const {snapshotHash}=await import("../src/lib/providers/snapshot-values");
    const payload=[{id:42,name:"Книга",authors:[]}];
    await saveProviderSnapshot({...describeBookSource("fantlab","42"),payload,payloadHash:snapshotHash(payload),contentType:"application/json",requestStartedAt:await providerRequestStartedAt(),fetchedAt:new Date()});
    await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'fantlab','42','{}')`;
    const publisherDecision=await moderation.resolveCreatorRequest({requestId:publisher.id,decision:"create",name:"Издательство",adminId:1});
    await moderation.applyCreatorRequest(publisher.id,{jobRunId:publisherDecision.jobRunId});
    await db.transaction(tx=>helper.syncFantlabBookContributors(tx,1,[...refs,{name:"Издатель",externalId:null,roleCode:"publisher",position:0}]));
    assert.equal((await client`select ct.code from entry_creators ec join creator_roles r on r.id=ec.role_id join creators c on c.id=ec.creator_id join creator_types ct on ct.id=c.type_id where r.code='publisher'`)[0].code,"organization");
    await client.unsafe(`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name) select 'fantlab','book',(g+1000000)::text,'Synthetic '||g,'synthetic '||g from generate_series(1,100000)g; analyze creator_requests;`);
    const captured:Array<{query:string;params:unknown[]}>=[];
    client.options.debug=(_c,query,params)=>{if(query.includes('"creator_requests"') && query.startsWith('select'))captured.push({query,params});};
    await db.transaction(tx=>helper.syncFantlabBookContributors(tx,1,refs));
    client.options.debug=false;
    for(const query of captured) {
      const [measured]=await client.unsafe("explain(analyze,buffers,format json) "+query.query,query.params as never[]);
      const plan=measured['QUERY PLAN'][0];
      assert.ok(!JSON.stringify(plan).includes('"Node Type":"Seq Scan"'),"identity/name lookup remains indexed at 100k requests");
      t.diagnostic(JSON.stringify({requests:100003,executionMs:plan['Execution Time'],plan:plan.Plan}));
    }
    const [plan]=await client.unsafe(`explain(analyze,buffers,format json) select * from creator_requests where provider='fantlab' and external_creator_id in ('101','102')`);
    t.diagnostic(JSON.stringify({identityPlan:plan['QUERY PLAN']}));
  } finally {await client.unsafe(`drop schema if exists ${schema} cascade`);await client.end();}
});
