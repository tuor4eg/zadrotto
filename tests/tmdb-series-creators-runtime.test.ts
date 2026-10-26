import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { describeTmdbSeriesSource, extractTmdbSeriesCreatorReferences } from "../src/lib/providers/tmdb-series-adapter";
import { snapshotHash } from "../src/lib/providers/snapshot-values";

const testUrl = process.env.TMDB_SERIES_TEST_DATABASE_URL;
test("TV rosters reuse global TMDB identities, preserve namespaces, moderation and manual links", { skip: !testUrl }, async () => {
  const schema = `tmdb_series_rosters_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { db, dbClient } = await import("../src/db");
  const { mediaItems } = await import("../src/db/schema");
  const { syncTmdbSeriesCreators, clearTmdbSeriesCreators, syncTmdbSeriesCreatorReferences } = await import("../src/db/queries/tmdb-series-creators");
  const { syncTmdbCompanyCreators } = await import("../src/db/queries/tmdb-companies");
  const requests = await import("../src/db/queries/creator-requests");
  const mutations = new Map<string, { sql: string; params: unknown[] }>();
  const captured = new Map<string, { sql: string; params: unknown[] }>();
  let currentReads: string[] | undefined;
  dbClient.options.debug = (_connection, query, params) => {
    if (/^\s*(insert|update|delete)/i.test(query)) mutations.set(query, {sql:query,params:[...params]});
    if (/^\s*select/i.test(query) && /\bfrom\b/i.test(query)) {
      captured.set(query, { sql: query, params: [...params] });
      currentReads?.push(query);
    }
  };
  const tables = ["creator_types","creator_roles","creators","creator_requests","creator_request_media_items","provider_creator_bindings","provider_creator_mappings","provider_creator_exclusions","entry_creators","entry_creator_sources","media_items","media_item_metadata","provider_snapshots","provider_snapshot_links","game_company_profiles","job_runs","admin_activity_logs","domain_events","domain_event_outbox"];
  try {
    await admin.unsafe(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
    for (const table of tables) await admin.unsafe(`CREATE UNLOGGED TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
    await admin.unsafe(`CREATE SEQUENCE creators_id_seq OWNED BY creators.id; ALTER TABLE creators ALTER COLUMN id SET DEFAULT nextval('creators_id_seq')`);
    await admin`INSERT INTO creator_types SELECT * FROM public.creator_types`;
    await admin`INSERT INTO creator_roles SELECT * FROM public.creator_roles`;
    const [org] = await admin`SELECT id FROM creator_types WHERE code='organization'`;
    const [person] = await admin`SELECT id FROM creator_types WHERE code='person'`;
    await admin`INSERT INTO media_items(id,code,title,media_type,publication_status) VALUES(1,'tv-one','TV One','series','published'),(2,'tv-two','TV Two','series','published'),(3,'film-one','Film One','film','published')`;
    const payload = (companies: {id:number;name:string}[] = [], networks: {id:number;name:string}[] = [], people: {id:number;name:string}[] = [], crew: unknown[] = []) => ({ id: 42, production_companies: companies, networks, created_by: people, aggregate_credits: { cast: [], crew } });
    const attach = async (id: number, value: ReturnType<typeof payload>) => {
      const descriptor = describeTmdbSeriesSource("42");
      await admin`INSERT INTO media_item_metadata(media_item_id,source_provider,source_external_id) VALUES(${id},'tmdb','42') ON CONFLICT(media_item_id) DO UPDATE SET source_provider='tmdb',source_external_id='42'`;
      const [snapshot] = await admin`INSERT INTO provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,payload_hash,content_type,request_started_at,fetched_at) VALUES('tmdb','tv','42','tv.details',${admin.json(descriptor.requestParams)},${snapshotHash(descriptor.requestParams)},${admin.json(value)},${snapshotHash(value)},'application/json',now(),now()) ON CONFLICT(provider_code,resource_type,external_id,api_method,request_key) DO UPDATE SET payload=excluded.payload,payload_hash=excluded.payload_hash RETURNING id`;
      await admin`DELETE FROM provider_snapshot_links WHERE entity_type='media-item' AND entity_id=${String(id)}`;
      await admin`INSERT INTO provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) VALUES(${snapshot.id},'media-item',${String(id)},'primary')`;
    };
    const sync = (id: number) => db.transaction(async tx => { await tx.select({id:mediaItems.id}).from(mediaItems).where(eq(mediaItems.id,id)).for("update"); return syncTmdbSeriesCreators(tx,id,{enqueueApproval:false}); });
    const request = async (externalId: string) => (await admin`SELECT * FROM creator_requests WHERE provider='tmdb' AND external_creator_id=${externalId}`)[0];
    const bound = async (externalId: string) => (await admin`SELECT creator_id FROM provider_creator_bindings WHERE provider='tmdb' AND external_creator_id=${externalId} AND active`)[0]?.creator_id;
    const settle = async (externalId: string) => {
      const row = await request(externalId);
      await admin`UPDATE job_runs SET status='succeeded' WHERE id=${row.job_run_id}`;
      await admin`UPDATE creator_requests SET apply_status='processed' WHERE id=${row.id}`;
    };
    await attach(1,payload([{id:42,name:'Studio'}],[{id:42,name:'Network'}],[{id:42,name:'Person'}],[{id:42,name:'Person',jobs:[{job:'Showrunner'}]}]));
    await sync(1);
    assert.deepEqual((await admin`SELECT external_creator_id FROM creator_requests ORDER BY external_creator_id`).map(row=>row.external_creator_id), ['company:42','network:42','person:42']);
    assert.equal((await admin`SELECT count(*)::int n FROM creator_request_media_items WHERE request_id=${(await request('person:42')).id}`)[0].n,2);
    await requests.autoApproveTmdbCompanyRequests({externalIds:['company:42','network:42']});
    await requests.autoApproveTmdbDirectorRequests({externalIds:['person:42']});
    assert.ok(await bound('company:42')); assert.ok(await bound('network:42')); assert.ok(await bound('person:42'));
    assert.notEqual(await bound('company:42'),await bound('network:42'));
    for(const id of ['company:42','network:42','person:42']) await settle(id);
    await sync(1); await sync(1);
    assert.equal((await admin`SELECT count(*)::int n FROM entry_creators WHERE entry_id=1`)[0].n,4);
    // A company identity is global across films and TV, without duplicating its request.
    await db.transaction(tx=>syncTmdbCompanyCreators(tx,3,[{externalId:'company:42',name:'Studio',roleCode:'production_company',sourcePosition:0,sourceUrl:'https://www.themoviedb.org/company/42',logoPath:null}]));
    assert.equal((await admin`SELECT count(*)::int n FROM creator_requests WHERE external_creator_id='company:42'`)[0].n,1);
    assert.equal((await admin`SELECT creator_id FROM entry_creators WHERE entry_id=3`)[0].creator_id,await bound('company:42'));
    // Different namespaces can share exactly one existing organization, but never merge peers.
    await attach(2,payload([],[{id:43,name:'Studio'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:43']}),{approved:1,skipped:0});
    assert.equal(await bound('network:43'),await bound('company:42'));
    await settle('network:43');
    await attach(2,payload([],[{id:44,name:'Studio'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:44']}),{approved:0,skipped:1},'same namespace collision stays pending');
    const [manual] = await admin`INSERT INTO creators(name,slug,type_id) VALUES('Manual','manual',${person.id}) RETURNING id`;
    const [creatorRole] = await admin`SELECT id FROM creator_roles WHERE code='creator'`;
    await admin`INSERT INTO entry_creators(entry_id,creator_id,role_id,is_manual) VALUES(1,${manual.id},${creatorRole.id},true)`;
    // An explicit empty roster clears source links but preserves manually owned participation.
    await attach(1,payload()); await sync(1);
    assert.deepEqual((await admin`SELECT creator_id FROM entry_creators WHERE entry_id=1`).map(row=>row.creator_id),[manual.id]);
    // Bad evidence rejects before modifying existing rosters.
    await attach(2,payload([],[{id:45,name:'Other'}])); await sync(2);
    const before = await admin`SELECT * FROM creator_request_media_items WHERE media_item_id=2`;
    await admin`UPDATE provider_snapshots SET payload=payload-'networks' WHERE resource_type='tv'`;
    await assert.rejects(sync(2),/INCOMPLETE_PROVIDER_SNAPSHOTS/);
    assert.deepEqual(await admin`SELECT * FROM creator_request_media_items WHERE media_item_id=2`,before);
    await db.transaction(tx=>clearTmdbSeriesCreators(tx,2));
    assert.equal((await admin`SELECT count(*)::int n FROM creator_request_media_items WHERE media_item_id=2`)[0].n,0);
    // Exact original/provider aliases are identity evidence; translated AI display names are not.
    const [aliasOwner] = await admin`INSERT INTO creators(name,original_name,slug,type_id) VALUES('English Company','Original Alias','original-alias',${org.id}) RETURNING id`;
    await attach(2,payload([],[{id:50,name:'Original Alias'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:50']}),{approved:1,skipped:0});
    assert.equal(await bound('network:50'),aliasOwner.id); await settle('network:50');
    const [mappingOwner] = await admin`INSERT INTO creators(name,slug,type_id) VALUES('Mapped English','mapped-owner',${org.id}) RETURNING id`;
    await admin`INSERT INTO provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) VALUES('tmdb','film','Provider Alias','provider alias',${mappingOwner.id})`;
    await attach(2,payload([],[{id:51,name:'Provider Alias'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:51']}),{approved:1,skipped:0});
    assert.equal(await bound('network:51'),mappingOwner.id); await settle('network:51');
    const [aiOwner] = await admin`INSERT INTO creators(name,name_ru,name_ru_source,slug,type_id) VALUES('Another Company','Имя ИИ','ai','ai-owner',${org.id}) RETURNING id`;
    await attach(2,payload([],[{id:52,name:'Имя ИИ'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:52']}),{approved:1,skipped:0});
    assert.notEqual(await bound('network:52'),aiOwner.id); await settle('network:52');
    await admin`INSERT INTO creators(name,slug,type_id) VALUES('Ambiguous','ambiguous-one',${org.id}),('Ambiguous','ambiguous-two',${org.id})`;
    await attach(2,payload([],[{id:53,name:'Ambiguous'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:53']}),{approved:0,skipped:1});
    await admin`INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id,active) VALUES('tmdb','network:54',${aliasOwner.id},false)`;
    await attach(2,payload([],[{id:54,name:'Original Alias'}])); await sync(2);
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:54']}),{approved:0,skipped:1});
    await admin`UPDATE creator_requests SET manually_reopened=true WHERE external_creator_id='network:54'`;
    assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({externalIds:['network:54']}),{approved:0,skipped:0});
    // All four roles share one bounded set of reads, including dual-role people.
    const measure = async (count: number) => {
      const rows = Array.from({length:count},(_,i)=>({id:1000+i,name:`Name ${i}`}));
      const refs = extractTmdbSeriesCreatorReferences({providerCode:"tmdb",externalId:"42",payload:payload(rows,rows,rows,rows.map(row=>({...row,jobs:[{job:"Showrunner"}]})))});
      currentReads=[];
      await db.transaction(tx=>syncTmdbSeriesCreatorReferences(tx,2,refs));
      const result=currentReads.length; currentReads=undefined; return result;
    };
    const one = await measure(1), ten = await measure(10);
    assert.equal(one,ten,"read roundtrips must not grow with returned links");
    assert.equal(one,5,"unbound roster: roles, previous identities, locked requests, bindings, exclusions");
    console.log(`TMDB roster read roundtrips: ${one} for 4 links; ${ten} for 40 links`);
    await attach(1,payload([{id:42,name:'Studio'}],[{id:42,name:'Network'}]));
    await attach(2,payload([{id:42,name:'Studio'}],[{id:42,name:'Network'}]));
    await Promise.all([sync(1),sync(2)]);
    assert.equal((await admin`SELECT count(*)::int n FROM creator_requests WHERE external_creator_id='company:42'`)[0].n,1);
    if (process.env.TMDB_SERIES_TEST_SCALE === "1") {
      await admin`INSERT INTO creators(id,name,slug,type_id) SELECT n,CASE WHEN n%10=0 THEN 'Common Organization' ELSE 'Organization '||n END,'org-'||n,${org.id} FROM generate_series(10000,109999)n`;
      await admin`INSERT INTO media_items(id,code,title,media_type,publication_status) SELECT n,'item-'||n,'TV '||n,'series','published' FROM generate_series(1000,100999)n`;
      await admin`INSERT INTO entry_creators(entry_id,creator_id,role_id) SELECT 1000+(n/10),10000+(n%100000),${creatorRole.id} FROM generate_series(0,999999)n`;
      await admin`INSERT INTO entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) SELECT entry_id,creator_id,role_id,'tmdb','tmdb:person:'||creator_id FROM entry_creators WHERE entry_id>=1000`;
      await admin`INSERT INTO creator_requests(id,provider,external_creator_id,media_type,external_creator_name,normalized_external_creator_name) SELECT 10000000+n,'tmdb','company:'||n,'series','Organization '||n,'organization '||n FROM generate_series(10000,109999)n`;
      await admin`INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) SELECT 'tmdb','company:'||n,n,'Organization '||n FROM generate_series(10000,109999)n`;
      await admin`INSERT INTO provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) SELECT 'tmdb','series','Organization '||n,'organization '||n,n FROM generate_series(10000,109999)n`;
      await admin`INSERT INTO provider_creator_exclusions(provider,external_creator_id,media_type,external_creator_name,normalized_external_creator_name) SELECT 'tmdb','network:'||n,'series','Excluded '||n,'excluded '||n FROM generate_series(10000,109999)n`;
      await admin`INSERT INTO creator_request_media_items(request_id,media_item_id,role_id,external_creator_name,source_position) SELECT 10010000+(n%100000),1000+(n/10),${creatorRole.id},'Organization '||(10000+n%100000),0 FROM generate_series(0,999999)n`;
      await admin`INSERT INTO media_item_metadata(media_item_id,source_provider,source_external_id) SELECT n,'tmdb',n::text FROM generate_series(1000,100999)n`;
      await admin`INSERT INTO provider_snapshots(id,provider_code,resource_type,external_id,api_method,request_params,request_key,payload,payload_hash,content_type,request_started_at,fetched_at) SELECT 20000000+n,'tmdb','tv',n::text,'tv.details','{}',repeat('f',64),'{}',repeat('a',64),'application/json',now(),now() FROM generate_series(1000,100999)n`;
      await admin`INSERT INTO provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) SELECT 20000000+n,'media-item',n::text,'primary' FROM generate_series(1000,100999)n`;
      for(const table of tables) await admin.unsafe(`ANALYZE ${table}`);
      const plans=[];
      for(const query of captured.values()) {
        const [plan]=await admin.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query.sql}`,query.params as never[]);
        plans.push({...query,plan:plan["QUERY PLAN"][0]});
      }
      const candidate = [...captured.values()].find(query=>query.sql.includes('inner join "creator_types"') && query.sql.includes('btrim') && query.params.length===4);
      if(candidate) for(const term of ['common organization','organization 10001','missing organization qzx']) {
        const params=[candidate.params[0],term,term,2];
        const [plan]=await admin.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${candidate.sql}`,params as never[]);
        plans.push({sql:candidate.sql,params,case:term,plan:plan["QUERY PLAN"][0]});
        console.log(`organization candidates ${term}: ${plan["QUERY PLAN"][0]["Execution Time"]}ms`);
      }
      for(const query of mutations.values()) {
        const [plan]=await admin.unsafe(`EXPLAIN (FORMAT JSON) ${query.sql}`,query.params as never[]);
        plans.push({...query,writeOnly:true,plan:plan["QUERY PLAN"][0]});
      }
      writeFileSync("/tmp/tmdb-series-roster-plans.json",JSON.stringify(plans,null,2));
      console.log(`EXPLAIN: ${captured.size + (candidate ? 3 : 0)} generated reads, ${mutations.size} non-executing write plans; 100000 creators/records/requests/bindings,1000000 relationships/sources/occurrences`);
    }
  } finally {
    await dbClient.end(); await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
