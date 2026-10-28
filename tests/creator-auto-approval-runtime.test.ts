import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.CREATOR_AUTO_APPROVAL_TEST_DATABASE_URL;
test("creator automatic decisions preserve manual review and atomicity", { skip: !testUrl }, async (t) => {
  const schema = `creator_auto_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "4";
  const { getDbClient, db } = await import("../src/db");
  const requests = await import("../src/db/queries/creator-requests");
  const { normalizeSearchText } = await import("../src/lib/search/normalize");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка'),('game','Игра'),('anime','Аниме');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text);
      INSERT INTO media_items VALUES(1,'one','Один','game','published'),(2,'two','Два','game','published'),(3,'three','Три','game','published'),(4,'four','Четыре','game','draft'),(5,'five','Пять','game','published');
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
    await client.unsafe(`CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY,provider_code text,external_id text,media_type text,title text,original_title text,description text,release_year integer,source_url text,facts jsonb DEFAULT '{}',payload_hash text,fetched_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql", "drizzle/0127_provider_snapshots.sql", "drizzle/0131_creator_life_dates.sql", "drizzle/0135_tmdb_company_creators.sql", "drizzle/0136_tmdb_director_creators.sql", "drizzle/0143_tmdb_series_creators.sql", "drizzle/0144_anilist_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`ALTER TABLE creators ADD COLUMN name_ru text,ADD COLUMN name_ru_source text,ADD COLUMN name_ru_processed boolean NOT NULL DEFAULT false`);
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,next_attempt_at timestamptz default now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const statement of readFileSync("drizzle/0147_creator_logo_candidates.sql", "utf8").split("--> statement-breakpoint").slice(0, 3)) await client.unsafe(statement);
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
    for(const statement of readFileSync("drizzle/0149_creator_auto_approval.sql","utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    let sequence = 1000;
    const request = async (name: string, provider = "google-books", externalId: string | null = null, mediaType = "book", role = "writer") => {
      const [row] = await client`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name)
        values(${provider},${mediaType},${externalId},${name},${normalizeSearchText(name)}) returning id`;
      await client`insert into creator_request_media_items(request_id,media_item_id,external_creator_name,role_id)
        select ${row.id},1,${name},id from creator_roles where code=${role}`;
      return Number(row.id);
    };
    const creator = async (name: string, extras: { originalName?: string; nameRu?: string } = {}) => {
      const [row] = await client`insert into creators(name,slug,type_id,original_name,name_ru)
        select ${name},${`fixture-${sequence++}`},id,${extras.originalName ?? null},${extras.nameRu ?? null} from creator_types where code='person' returning id`;
      return Number(row.id);
    };
    const auto = (requestId: number) => requests.resolveCreatorRequest({requestId,decision:"create",autoApprove:true});
    const skip = async (id: number) => {
      const before = await client`select (select count(*) from creators)::int creators,(select count(*) from job_runs)::int jobs`;
      await assert.rejects(auto(id), (error: unknown) => (error as {code?: string}).code === "auto-skip");
      assert.deepEqual(await client`select (select count(*) from creators)::int creators,(select count(*) from job_runs)::int jobs`, before);
      assert.equal((await client`select decision from creator_requests where id=${id}`)[0].decision,null);
    };
    await t.test("all resolver provider branches create from request names and enqueue once", async () => {
      for (const [provider, externalId, mediaType, role, name] of [
        ["google-books",null,"book","writer","Gutenberg Alpha"],
        ["fantlab","1001","book","writer","Fantlab Beta"],
        ["bgg","1002","boardgame","designer","Board Gamma"],
        ["tmdb","person:1003","film","director","Movie Delta"],
        ["igdb","company:1004","game","developer","Games Epsilon"],
        ["anilist","person:1005","anime","director","Anime Zeta"],
      ] as const) {
        const id = await request(name,provider,externalId,mediaType,role);
        const queued = await auto(id);
        assert.ok(queued.jobRunId > 0);
        assert.equal((await client`select decision from creator_requests where id=${id}`)[0].decision,"create");
        assert.equal((await client`select count(*)::int n from creators where name=${name}`)[0].n,1);
        await assert.rejects(auto(id));
        assert.equal((await client`select count(*)::int n from job_runs where type='media.creator-request-apply' and payload->>'requestId'=${String(id)}`)[0].n,1);
      }
    });
    await t.test("substring, reversed words and aliases require review; one distinct word is allowed", async () => {
      const owner = await creator("Иван Петров",{originalName:"John Smith",nameRu:"Иоганн Шмидт"});
      await client`insert into provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) values('open-library','book','Mapped Alias','mapped alias',${owner})`;
      await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values('fantlab','3999','Bound Alias',${owner})`;
      for (const name of ["Иван Петров", "Петров Иван", "Автор Иван Петров", "Smith John", "Шмидт Иоганн", "Alias Mapped", "Alias Bound"]) await skip(await request(name));
      const allowed = await request("Иван Сидоров");
      await auto(allowed);
      await auto(await request("Иван Иван Нестеров"));
      const manual = await request("Иван Петров Второй");
      await requests.resolveCreatorRequest({requestId:manual,decision:"create",name:"Иван Петров Второй",adminId:1});
      assert.equal((await client`select decision from creator_requests where id=${manual}`)[0].decision,"create");
    });
    await t.test("reopened, excluded, historical IDs and conflicting observations preserve pending state", async () => {
      const reopened = await request("Reopened Unique");
      await client`update creator_requests set manually_reopened=true where id=${reopened}`;
      await skip(reopened);
      const excluded = await request("Excluded Unique");
      await client`insert into provider_creator_exclusions(provider,media_type,external_creator_name,normalized_external_creator_name) values('google-books','book','Excluded Unique','excluded unique')`;
      await skip(excluded);
      const historical = await request("Historical Unique","fantlab","2001");
      const owner = await creator("History Owner");
      await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id,active) values('fantlab','2001','Historical Unique',${owner},false)`;
      await skip(historical);
      const conflict = await request("Conflicting Unique","bgg","2002","boardgame","designer");
      await client`insert into creator_request_media_items(request_id,media_item_id,external_creator_name,role_id) select ${conflict},2,'Different Unique',id from creator_roles where code='designer'`;
      await skip(conflict);
    });
    await t.test("confirmed external identity overrides the name similarity gate", async () => {
      const owner = await creator("Confirmed Owner");
      await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values('tmdb','person:3001','Confirmed Owner',${owner})`;
      const id = await request("Confirmed Owner","tmdb","person:3001","film","director");
      await auto(id);
      assert.equal((await client`select decision from creator_requests where id=${id}`)[0].decision,"map");
    });
    await t.test("confirmed BGG and IGDB bindings retain provenance IDs", async () => {
      for (const [provider, externalId, mediaType, role] of [["bgg","8001","boardgame","designer"],["igdb","company:8002","game","developer"]]) {
        const [owner] = await client`insert into creators(name,slug,type_id) select ${`Confirmed ${provider}`},${`confirmed-${provider}`},id from creator_types where code=${provider==='igdb'?'organization':'person'} returning id`;
        const [binding] = await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values(${provider},${externalId},${`Confirmed ${provider}`},${owner.id}) returning id`;
        await auto(await request(`Confirmed ${provider}`,provider,externalId,mediaType,role));
        assert.equal((await client`select id from provider_creator_bindings where provider=${provider} and external_creator_id=${externalId} and active`)[0].id,binding.id);
      }
    });
    await t.test("sync queues name-only and BGG requests without mapping exact names", async () => {
      await creator("Queue Author");
      await creator("Queue Designer");
      await db.transaction(tx=>requests.syncProviderCreators(tx,{mediaItemId:3,provider:"google-books",mediaType:"book",facts:{authors:["Queue Author"]}}));
      await db.transaction(tx=>requests.syncProviderCreators(tx,{mediaItemId:4,provider:"bgg",mediaType:"boardgame",facts:{bggCreators:[{externalId:"8101",name:"Queue Designer",roleCode:"designer"}]}}));
      const rows = await client`select id,decision from creator_requests where external_creator_name in ('Queue Author','Queue Designer')`;
      assert.equal(rows.length,2);
      assert.ok(rows.every(row=>row.decision===null));
      assert.equal((await client`select count(*)::int n from provider_creator_bindings where provider='bgg' and external_creator_id='8101'`)[0].n,0);
      for(const row of rows) assert.ok((await client`select id from job_runs where type='media.creator-request-auto-approve' and payload->'requestIds' @> ${JSON.stringify([row.id])}::jsonb`).length);
    });
    await t.test("BGG sync cannot revive an inactive historical identity", async () => {
      const owner = await creator("Dormant Designer");
      await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id,active)
        values('bgg','8102','Dormant Designer',${owner},false)`;
      await db.transaction(tx=>requests.syncProviderCreators(tx,{mediaItemId:4,provider:"bgg",mediaType:"boardgame",facts:{bggCreators:[{externalId:"8102",name:"Dormant Designer",roleCode:"designer"}]}}));
      const [pending] = await client`select id,decision from creator_requests where provider='bgg' and external_creator_id='8102'`;
      assert.equal(pending.decision,null);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=4 and creator_id=${owner}`)[0].n,0);
      await skip(Number(pending.id));
      assert.equal((await client`select count(*)::int n from provider_creator_bindings where provider='bgg' and external_creator_id='8102' and active`)[0].n,0);
    });
    await t.test("handler executes IDs idempotently and continues bounded backlog with fixed cutoff", async () => {
      const {creatorAutoApprovalHandler:handler} = await import("../src/lib/creators/auto-approval-job");
      const run = async (payload: unknown) => {
        const [job] = await client`insert into job_runs(type,payload,status,lock_token,lock_expires_at) values('media.creator-request-auto-approve',${JSON.stringify(payload)}::jsonb,'running','test-lease',now()+interval '5 minutes') returning id`;
        const context={payload:handler.parsePayload(payload),runId:Number(job.id),lockToken:"test-lease",attempt:1,jobId:null,source:"event" as const,signal:new AbortController().signal};
        await handler.execute(context);
        return context;
      };
      const id=await request("Handler Solo");
      const context=await run({requestIds:[id]});
      const jobsBefore=(await client`select count(*)::int n from job_runs`)[0].n;
      await handler.execute(context);
      assert.equal((await client`select count(*)::int n from job_runs`)[0].n,jobsBefore);
      const {getJobManualPlacement}=await import("../src/lib/jobs/catalog");
      assert.equal(getJobManualPlacement(handler.type),"general");
      assert.equal(handler.schedulable,true);
      assert.deepEqual(handler.parsePayload({}),{scanPending:true});
      assert.deepEqual(handler.parsePayload({scanPending:true}),{scanPending:true});
      for(const invalid of [null,[],{scanPending:false},{scanPending:true,requestIds:[id]}]) assert.throws(()=>handler.parsePayload(invalid));
      const manual=await request("ManualScanMarkerUnique");
      await run({});
      const [manualBatch]=await client`select payload from job_runs where type='media.creator-request-auto-approve' and payload->>'afterId'='0' and payload->>'upToId'=${String(manual)} order by id desc limit 1`;
      assert.ok(manualBatch);
      const future=await request("FutureScanMarkerUnique");
      await run(manualBatch.payload);
      assert.equal((await client`select decision from creator_requests where id=${manual}`)[0].decision,'create');
      assert.equal((await client`select decision from creator_requests where id=${future}`)[0].decision,null);
      const batch:number[]=[];
      for(let n=0;n<101;n++) batch.push(await request(`BacklogMarker${n}`));
      const upToId=batch[100];
      const newer=await request("AfterCutoffMarker");
      await run({afterId:batch[0]-1,upToId});
      assert.equal((await client`select count(*)::int n from creator_requests where id>=${batch[0]} and id<=${upToId} and decision='create'`)[0].n,100);
      const [continuation]=await client`select id,payload from job_runs where type='media.creator-request-auto-approve' and payload->>'afterId'=${String(batch[99])} and payload->>'upToId'=${String(upToId)}`;
      assert.ok(continuation);
      await run(continuation.payload);
      assert.equal((await client`select decision from creator_requests where id=${batch[100]}`)[0].decision,'create');
      assert.equal((await client`select decision from creator_requests where id=${newer}`)[0].decision,null);
      const stale=await request("StaleLeaseMarker");
      await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=${context.runId}`;
      await assert.rejects(handler.execute({...context,payload:{requestIds:[stale]}}),(error:unknown)=>(error as {code?:string}).code==='lease-lost');
      assert.equal((await client`select decision from creator_requests where id=${stale}`)[0].decision,null);
      assert.equal((await client`select count(*)::int n from creators where name='StaleLeaseMarker'`)[0].n,0);
    });
    await t.test("parallel reversed names create one identity; failed enqueue rolls back the identity", async () => {
      const ids = await Promise.all([request("Константин Волков"),request("Волков Константин","open-library")]);
      const result = await Promise.allSettled(ids.map(auto));
      assert.equal(result.filter(row=>row.status==='fulfilled').length,1);
      assert.equal(result.filter(row=>row.status==='rejected' && row.reason.code==='auto-skip').length,1);
      const id = await request("Rollback Unique");
      await client.unsafe(`CREATE FUNCTION fail_creator_apply() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='media.creator-request-apply' THEN RAISE EXCEPTION 'fixture enqueue failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_creator_apply BEFORE INSERT ON job_runs FOR EACH ROW EXECUTE FUNCTION fail_creator_apply()`);
      try { await assert.rejects(auto(id), (error: unknown) => /fixture enqueue failure/.test(String((error as {cause?: unknown}).cause))); }
      finally { await client.unsafe(`DROP TRIGGER fail_creator_apply ON job_runs; DROP FUNCTION fail_creator_apply()`); }
      assert.equal((await client`select count(*)::int n from creators where name='Rollback Unique'`)[0].n,0);
      assert.equal((await client`select decision from creator_requests where id=${id}`)[0].decision,null);
    });
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
