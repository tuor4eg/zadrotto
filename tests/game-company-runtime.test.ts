import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";

const testUrl = process.env.GAME_COMPANIES_TEST_DATABASE_URL;

test("game company identities, moderation and backfill checkpoints persist through PostgreSQL", { skip: !testUrl }, async (t) => {
  const schema = `game_companies_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient, db } = await import("../src/db");
  const { mediaItems } = await import("../src/db/schema");
  const creators = await import("../src/db/queries/creators");
  const requests = await import("../src/db/queries/creator-requests");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка'),('game','Игра');
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
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const { saveGameCompanyRoster, getGameCompanyRosterBatch, syncGameCompanyCreators } = await import("../src/db/queries/game-companies");
    const backfill = await import("../src/db/queries/game-company-backfill");
    const organization = (await creators.getCreatorTypes()).find(row=>row.code==='organization')!;
    const developer = (await creators.getCreatorRoles()).find(row=>row.code==='developer')!;
    const company = await creators.createCreator({name:'Same Studio',slug:'same-studio',typeId:organization.id});
    const ref = (externalId:string,roleCode:'developer'|'publisher'='developer') => ({externalId,name:'Same Studio',roleCode});
    const save = (mediaItemId:number,provider:'igdb'|'rawg',sourceExternalId:string,references:ReturnType<typeof ref>[]) => db.transaction(async tx=>{
      await tx.select({id:mediaItems.id}).from(mediaItems).where(sql`${mediaItems.id}=${mediaItemId}`).for('update');
      return saveGameCompanyRoster(tx,{mediaItemId,provider,sourceExternalId,references,enqueueEnrichment:false});
    });
    const requestFor = async (provider:string,externalId:string) => (await client`select * from creator_requests where provider=${provider} and external_creator_id=${externalId}`)[0];
    const bindingFor = async (provider:string,externalId:string) => (await client`select * from provider_creator_bindings where provider=${provider} and external_creator_id=${externalId} order by active desc,id desc`)[0];
    const apply = async (decision:{requestId:number;jobRunId:number}) => {
      await requests.applyCreatorRequest(decision.requestId,{jobRunId:decision.jobRunId});
      await client`update job_runs set status='succeeded' where id=${decision.jobRunId}`;
    };
    await t.test('identical names never automatically bind; RAWG namespaces remain separate',async()=>{
      await save(1,'rawg','101',[ref('developer:7'),ref('publisher:7','publisher')]);
      await save(2,'rawg','102',[ref('developer:7')]);
      await save(1,'igdb','201',[ref('company:9'),ref('company:9','publisher')]);
      assert.equal(await bindingFor('rawg','developer:7'),undefined);
      assert.equal(await bindingFor('rawg','publisher:7'),undefined);
      assert.equal(await bindingFor('igdb','company:9'),undefined);
      assert.notEqual((await requestFor('rawg','developer:7')).id,(await requestFor('rawg','publisher:7')).id);
      assert.equal((await client`select count(*)::int n from creators`)[0].n,1);
    });
    await t.test('approval applies all local rosters even after occurrence deletion and metadata source change',async()=>{
      const request=await requestFor('rawg','developer:7');
      await client`delete from creator_request_media_items where request_id=${request.id}`;
      await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'igdb','201','{}'),(2,'igdb','202','{}')`;
      await apply(await requests.resolveCreatorRequest({requestId:request.id,adminId:1,decision:'map',creatorId:company.id}));
      assert.deepEqual((await client`select entry_id from entry_creators where creator_id=${company.id} and role_id=${developer.id} order by entry_id`).map(row=>row.entry_id),[1,2]);
      assert.equal((await getGameCompanyRosterBatch('rawg','developer:7')).length,2);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('rawg','publisher:7')).id,adminId:1,decision:'map',creatorId:company.id}));
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('igdb','company:9')).id,adminId:1,decision:'map',creatorId:company.id}));
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1 and creator_id=${company.id}`)[0].n,2);
      assert.equal((await client`select count(*)::int n from provider_creator_bindings where creator_id=${company.id}`)[0].n,3);
      const searchMatches = await db.select({id:mediaItems.id}).from(mediaItems)
        .where(creators.entryCreatorSearchCondition('  SAME   studio '));
      assert.deepEqual(searchMatches.map(row=>row.id).sort((a,b)=>a-b),[1,2],
        'organization search includes developer and publisher roles without duplicate entries');
      for (const roleCode of ['developer', 'publisher']) {
        const filtered = await creators.getCreators({typeCode:'organization',roleCode,q:'Same Studio',pageSize:1,page:2});
        assert.deepEqual(filtered.items.map(row=>row.id),[company.id]);
        assert.equal(filtered.totalCount,1,'multiple entries and roles do not duplicate creators');
        assert.equal(filtered.page,1,'pagination counts use the same filters');
      }
      assert.equal((await creators.getCreators({typeCode:'person',roleCode:'developer'})).totalCount,0);
      assert.equal((await creators.getCreators({typeCode:'organization',roleCode:'writer'})).totalCount,0);
      const roleIds=async(roleCode?:string)=>(await db.select({id:mediaItems.id}).from(mediaItems)
        .where(creators.creatorCondition(company.id,undefined,roleCode))).map(row=>row.id).sort((a,b)=>a-b);
      assert.deepEqual(await roleIds(),[1,2]);
      assert.deepEqual(await roleIds('developer'),[1,2]);
      assert.deepEqual(await roleIds('publisher'),[1]);
      assert.deepEqual(await roleIds('unknown-role'),[]);
      const {getCatalogMediaTypeCounts,getCatalogReleaseYearBounds}=await import('../src/db/queries/media-items');
      const filters={authorRatingFilter:'all' as const,enabledMediaTypeCodes:['game'],searchQuery:'',yearFilter:null,yearMode:'release' as const,creatorId:company.id};
      assert.deepEqual(await getCatalogMediaTypeCounts({...filters,creatorRole:'developer'}),[{mediaType:'game',count:2}]);
      assert.deepEqual(await getCatalogMediaTypeCounts({...filters,creatorRole:'publisher'}),[{mediaType:'game',count:1}]);
      await client`update media_items set release_year=case when id=1 then 2001 else 1990 end where id in (1,2)`;
      assert.equal((await getCatalogReleaseYearBounds(['game'],undefined,company.id,undefined,'developer')).minReleaseYear,1990);
      assert.equal((await getCatalogReleaseYearBounds(['game'],undefined,company.id,undefined,'publisher')).minReleaseYear,2001);
      await client`update media_items set release_year=null where id in (1,2)`;

    });
    await t.test('updating one provider preserves another provider and manual links; empty is scoped',async()=>{
      await creators.setManualEntryCreators(1,[{creatorId:company.id,roleId:developer.id}]);
      await save(1,'rawg','101',[]);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1 and provider='igdb'`)[0].n,2);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1`)[0].n,2);
      await save(1,'igdb','201',[]);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1`)[0].n,1);
      assert.equal((await client`select is_manual from entry_creators where entry_id=1`)[0].is_manual,true);
    });
    await t.test('reopening one namespace preserves the other binding and manual links',async()=>{
      await save(1,'rawg','101',[ref('developer:7'),ref('publisher:7','publisher')]);
      const binding=await bindingFor('rawg','developer:7');
      await apply(await requests.reopenCreatorBinding({bindingId:binding.id,adminId:1}));
      assert.equal((await bindingFor('rawg','developer:7')).active,false);
      assert.ok((await bindingFor('rawg','publisher:7')).active);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=2`)[0].n,0);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1`)[0].n,2);
    });
    await t.test('reopened identity can map to another organization without API and exclusion is identity scoped',async()=>{
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('rawg','developer:7')).id,adminId:1,decision:'create',name:'Different Studio',typeCode:'organization'}));
      const replacement=await bindingFor('rawg','developer:7');
      assert.notEqual(replacement.creator_id,company.id);
      assert.deepEqual((await client`select entry_id from entry_creators where creator_id=${replacement.creator_id} order by entry_id`).map(row=>row.entry_id),[1,2]);
      assert.equal((await client`select is_manual from entry_creators where entry_id=1 and creator_id=${company.id} and role_id=${developer.id}`)[0].is_manual,true);
      await save(3,'rawg','103',[ref('publisher:8','publisher')]);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('rawg','publisher:8')).id,adminId:1,decision:'exclude'}));
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=3`)[0].n,0);
      assert.ok((await bindingFor('rawg','publisher:7')).active);
    });
    await t.test('legacy absent roster preserves sources; malformed IDs fail atomically',async()=>{
      const before=await client`select * from entry_creator_sources where entry_id=1 order by provider,creator_id,role_id`;
      await db.transaction(tx=>syncGameCompanyCreators(tx,1,'rawg',{developers:['Legacy']}));
      assert.deepEqual(await client`select * from entry_creator_sources where entry_id=1 order by provider,creator_id,role_id`,before);
      await assert.rejects(save(1,'rawg','101',[ref('publisher:7')]));
      await assert.rejects(save(1,'igdb','201',[ref('9')]));
      await assert.rejects(client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('rawg','7',${company.id},'Invalid')`);
      assert.deepEqual(await client`select * from entry_creator_sources where entry_id=1 order by provider,creator_id,role_id`,before);
    });
    await t.test('manifest resumes checkpoints without spending retry budget or reprocessing completed items',async()=>{
      await client`insert into media_item_provider_snapshots(media_item_id,provider_code,external_id,media_type,title,facts,payload_hash) values(1,'rawg','101','game','One','{"kept":true}','old')`;
      const [run]=await client`insert into job_runs(type,status,created_by_admin_id) values('media.game-companies-backfill','running',1) returning id`;
      const id=await backfill.claimGameCompanyBackfill(run.id);
      assert.ok(id);
      const batch=await backfill.getGameCompanyBackfillBatch(id!);
      assert.equal(batch.length,3); // IGDB metadata for both entries, RAWG snapshot for first.
      const item=batch.find(value=>value.provider==='rawg')!;
      await backfill.checkpointGameCompanyItem(item,{references:[ref('developer:7')],status:'ready',attempts:2});
      assert.equal(await backfill.claimGameCompanyBackfill(run.id),id);
      const continued=(await backfill.getGameCompanyBackfillBatch(id!)).find(value=>value.provider==='rawg')!;
      assert.equal(continued.attempts,2);
      assert.deepEqual(continued.references,[ref('developer:7')]);
      await db.transaction(tx=>backfill.mergeGameCompanyMetadata(tx,continued,continued.references!));
      const [snapshot]=await client`select facts,payload_hash from media_item_provider_snapshots where media_item_id=1`;
      assert.equal(snapshot.facts.kept,true);
      assert.notEqual(snapshot.payload_hash,'old');
      assert.deepEqual((await client`select facts from media_item_metadata where media_item_id=1`)[0].facts,{},'unrelated metadata provider is untouched');
      await backfill.checkpointGameCompanyItem(continued,{status:'done'});
      assert.equal((await backfill.getGameCompanyBackfillBatch(id!)).some(value=>value.provider==='rawg'),false);
      assert.equal((await backfill.getGameCompanyBackfillProgress())!.done,0,'game is complete only after all its provider sources');
      const sameGame=(await backfill.getGameCompanyBackfillBatch(id!)).find(value=>value.mediaItemId===continued.mediaItemId)!;
      await backfill.checkpointGameCompanyItem(sameGame,{status:'done'});
      assert.equal((await backfill.getGameCompanyBackfillProgress())!.done,1);
      await client`update media_item_provider_snapshots set external_id='999' where media_item_id=1`;
      assert.equal(await backfill.isCurrentGameCompanySource(continued),false);
    });
    await t.test('concurrent roster import and reopen converge after apply without erasing unrelated sources',async()=>{
      await save(4,'rawg','104',[ref('developer:77')]);
      await save(5,'rawg','105',[ref('developer:77')]);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('rawg','developer:77')).id,adminId:1,decision:'map',creatorId:company.id}));
      const binding=await bindingFor('rawg','developer:77');
      const [,decision]=await Promise.all([
        save(4,'rawg','104',[ref('developer:77')]),
        requests.reopenCreatorBinding({bindingId:binding.id,adminId:1}),
      ]);
      await apply(decision);
      assert.equal((await bindingFor('rawg','developer:77')).active,false);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where binding_id=${binding.id}`)[0].n,0);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id in (4,5)`)[0].n,0);
      assert.ok((await bindingFor('rawg','publisher:7')).active);
    });
    await t.test('avatars use saved lowest IGDB logo; concurrent and existing manual image wins',async()=>{
      const {syncGameCompanyAvatar}=await import('../src/lib/creators/game-company-images');
      const hash='a'.repeat(64);
      for(const externalId of ['company:2','company:9']) {
        await client`insert into game_company_profiles(provider,external_id,name,source_url,image_url,image_object_key,image_content_hash,profile_status,image_status)
          values('igdb',${externalId},'Studio','https://www.igdb.com/companies/studio','https://images.igdb.com/logo.png',${'profile/'+externalId},${hash},'ready','ready')
          on conflict(provider,external_id) do update set source_url=excluded.source_url,image_url=excluded.image_url,image_object_key=excluded.image_object_key,image_content_hash=excluded.image_content_hash,profile_status='ready',image_status='ready'`;
      }
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('igdb','company:2',${company.id},'Studio')`;
      const uploadedKey=`avatars/creators/${company.id}/11111111-1111-4111-8111-111111111111.webp`;
      const manualKey=`avatars/creators/${company.id}/22222222-2222-4222-8222-222222222222.webp`;
      const lostKey=`avatars/creators/${company.id}/33333333-3333-4333-8333-333333333333.webp`;
      const fetched:string[]=[];const cleaned:Array<string|null>=[];
      const fetchLocal=async({objectKey}:{objectKey:string})=>{fetched.push(objectKey);return new Response('saved-logo');};
      await syncGameCompanyAvatar(company.id,{fetchLocal,upload:async()=>({objectKey:uploadedKey,contentHash:hash}),cleanup:async key=>{cleaned.push(key);}});
      assert.deepEqual(fetched,['profile/company:2']);
      assert.equal((await client`select avatar_source_external_id from creators where id=${company.id}`)[0].avatar_source_external_id,'company:2');
      await client`update game_company_profiles set image_content_hash=${'b'.repeat(64)} where provider='igdb' and external_id='company:2'`;
      await syncGameCompanyAvatar(company.id,{fetchLocal,upload:async()=>{
        await client`update creators set avatar_object_key=${manualKey},avatar_content_hash=${'c'.repeat(64)},avatar_source='manual',avatar_source_external_id=null,avatar_source_url=null,avatar_original_url=null,avatar_fetched_at=null,avatar_version=avatar_version+1 where id=${company.id}`;
        return {objectKey:lostKey,contentHash:'b'.repeat(64)};
      },cleanup:async key=>{cleaned.push(key);}});
      assert.equal((await client`select avatar_object_key from creators where id=${company.id}`)[0].avatar_object_key,manualKey);
      assert.ok(cleaned.includes(lostKey));
      assert.ok(!cleaned.includes(manualKey));
      await syncGameCompanyAvatar(company.id,{fetchLocal:async()=>{assert.fail('manual avatar must skip storage fetch');},upload:async()=>{assert.fail('manual avatar must skip upload');}});
    });
    await t.test('automatic approval uses ordinary decisions, exact organizations and separate provider namespaces', async () => {
      const autoRef = (externalId: string, roleCode: 'developer' | 'publisher' = 'developer', name = 'Auto Studio') => ({ externalId, roleCode, name });
      await save(5, 'igdb', '705', [autoRef('company:7001')]);
      assert.deepEqual(await requests.autoApproveGameCompanyRequests({ provider: 'igdb', externalIds: ['company:7001'] }), { approved: 1, skipped: 0 });
      const created = await requestFor('igdb', 'company:7001');
      assert.equal(created.decision, 'create');
      await apply({ requestId: created.id, jobRunId: created.job_run_id });
      const binding = await bindingFor('igdb', 'company:7001');
      await save(4, 'rawg', '704', [autoRef('developer:7002', 'developer', ' AUTO   Studio '), autoRef('publisher:7002', 'publisher')]);
      assert.deepEqual(await requests.autoApproveGameCompanyRequests({ provider: 'rawg', externalIds: ['developer:7002', 'publisher:7002'] }), { approved: 2, skipped: 0 });
      for (const id of ['developer:7002', 'publisher:7002']) {
        const approved = await requestFor('rawg', id);
        assert.equal(approved.decision, 'map');
        await apply({ requestId: approved.id, jobRunId: approved.job_run_id });
        assert.equal((await bindingFor('rawg', id)).creator_id, binding.creator_id);
      }
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=4 and creator_id=${binding.creator_id}`)[0].n, 2);
      assert.equal((await requests.autoApproveGameCompanyRequests({ provider: 'rawg', externalIds: ['developer:7002'] })).approved, 0);
      await save(3, 'igdb', '703', [autoRef('company:7003')]);
      assert.deepEqual(await requests.autoApproveGameCompanyRequests({ provider: 'igdb', externalIds: ['company:7003'] }), { approved: 0, skipped: 1 });
      assert.equal((await requestFor('igdb', 'company:7003')).decision, null, 'a different ID in the same namespace needs review');
      const reopened = await requests.reopenCreatorBinding({ bindingId: (await bindingFor('rawg', 'developer:7002')).id, adminId: 1 });
      await apply(reopened);
      assert.equal((await requests.autoApproveGameCompanyRequests({ provider: 'rawg', externalIds: ['developer:7002'] })).approved, 0);
      assert.equal((await requestFor('rawg', 'developer:7002')).decision, null);
      for (const slug of ['auto-ambiguous-a', 'auto-ambiguous-b']) await creators.createCreator({ name: 'Ambiguous Auto', slug, typeId: organization.id });
      await save(3, 'rawg', '703', [autoRef('developer:7100', 'developer', 'Ambiguous Auto')]);
      assert.deepEqual(await requests.autoApproveGameCompanyRequests({ provider: 'rawg', externalIds: ['developer:7100'] }), { approved: 0, skipped: 1 });
      // A confirmed external identity takes precedence over a changed provider spelling.
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('rawg','publisher:7200',${binding.creator_id},'Old name')`;
      await save(2, 'rawg', '702', [autoRef('publisher:7200', 'publisher', 'Completely Different Spelling')]);
      assert.equal((await requests.autoApproveGameCompanyRequests({ provider: 'rawg', externalIds: ['publisher:7200'] })).approved, 1);
      assert.equal((await bindingFor('rawg', 'publisher:7200')).creator_id, binding.creator_id);
      const pending = await client`select id from creator_requests where external_creator_id='company:7003'`;
      assert.equal(pending.length, 1);
    });
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
