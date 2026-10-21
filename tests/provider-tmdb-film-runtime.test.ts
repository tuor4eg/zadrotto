import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Every write uses copied tables and independent sequences, never application rows.
test("TMDB film raw import and offline replay preserve manual data and commit checkpoint atomically", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async (t) => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const original = process.env.DATABASE_URL!;
  const originalFetch = globalThis.fetch;
  const admin = postgres(original, { max: 1, prepare: false });
  const schema = `tmdb_film_${process.pid}_${Date.now()}`;
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(original);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    const tables = await admin`select tablename from pg_tables where schemaname='public'`;
    for (const { tablename } of tables) await client.unsafe(`create table ${quote(tablename)} (like public.${quote(tablename)} including defaults including constraints including indexes)`);
    const serials = await client`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for (const [index, column] of serials.entries()) {
      await client.unsafe(`create sequence ${schema}.test_serial_${index} start 1000000`);
      await client.unsafe(`alter table ${quote(column.table_name)} alter column ${quote(column.column_name)} set default nextval('${schema}.test_serial_${index}')`);
    }
    if (!tables.some(row => row.tablename === "provider_snapshots")) {
      for (const statement of (await readFile("drizzle/0127_provider_snapshots.sql", "utf8")).split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    for (const table of ["media_types", "creator_types", "creator_roles"]) await client.unsafe(`insert into ${quote(table)} select * from public.${quote(table)}`);
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) values(1,'manual-film','Ручное название','film','published');
      insert into genres(id,slug,name) values(1,'manual-genre','Ручной жанр');
      insert into media_item_genres(media_item_id,genre_id,is_manual) values(1,1,true);
      insert into provider_genre_exclusions(provider,media_type,external_genre_name,normalized_external_genre_name) values('tmdb','film','Excluded','excluded');
      insert into genre_requests(provider,media_type,external_genre_name,normalized_external_genre_name,decision,resolved_at,apply_status)
        values('tmdb','film','Excluded','excluded','exclude',now(),'processed');
      insert into creators(id,name,slug,type_id) select 1,'Manual','manual',id from creator_types where code='person';
      insert into entry_creators(entry_id,creator_id,role_id,is_manual) select 1,1,id,true from creator_roles where code='writer';
      insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'tmdb','42','{"legacyField":"preserve during transition"}');`);
    const service = await import("../src/lib/providers/tmdb-film-service");
    const { upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
    const raw = {
      id: 42, title: "API title", runtime: 123, original_language: "fr", genres: [{ id: 18, name: "Excluded" }],
      production_countries: [{ name: "France" }], production_companies: [{ name: "Studio" }],
      credits: { cast: [{ id: 200, name: "Actor" }], crew: [{ id: 201, name: "Director", job: "Director" }] },
      future: { unknown: [true, 4] },
    };
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls++;
      const request = new URL(String(input));
      assert.equal(request.pathname, "/3/movie/42");
      assert.equal(request.searchParams.get("append_to_response"), "credits");
      return Response.json(raw);
    };
    const { getTitleMetadata } = await import("../src/lib/covers/registry");
    const previewResult = await getTitleMetadata({ provider: "tmdb", externalId: "42", mediaType: "film" }, undefined, {
      enrichTitleFields: true, candidateLimit: 1, tmdbResultScanLimit: 1, providerCredentials: { tmdb: { accessToken: "test-token" } },
    });
    assert.equal(previewResult.error,null);
    assert.ok(previewResult.metadata);
    const preview = previewResult.metadata;
    assert.equal(preview.fields, undefined, "film details must not change search-selected editorial fields");
    const { getMediaTitleMetadataFormFields } = await import("../src/lib/media/title-candidate-form");
    const selectedFields = { title:"Search title",originalTitle:"Search original",releaseYear:"1999",description:"Search description" };
    assert.deepEqual(getMediaTitleMetadataFormFields(preview.fields,selectedFields,false),selectedFields);
    const base = { mediaItemId: 1, facts: preview.facts, sourceProvider: "tmdb", sourceExternalId: "42", snapshotReferences: preview.snapshotReferences };
    await upsertMediaItemMetadata(base);
    assert.deepEqual((await client`select payload from provider_snapshots`)[0].payload, raw);
    globalThis.fetch = async () => { throw new Error("OFFLINE_REPLAY_MUST_NOT_FETCH"); };
    const saved = await service.getSavedTmdbFilmBundle("42");
    await upsertMediaItemMetadata({ ...base, facts: saved.projection.facts });
    const { createMediaMetadataCandidateToken } = await import("../src/lib/media/metadata-candidates");
    const { resolveMediaMetadataFormMutation } = await import("../src/lib/media/metadata-form-mutation");
    const { validateBookFormMutation } = await import("../src/lib/providers/book-form-mutation");
    const token = createMediaMetadataCandidateToken({ provider: "tmdb", externalId: "42", mediaType: "film",
      sourceUrl: preview.sourceUrl ?? null, facts: { runtimeMinutes: 999, credits: { forged: true } }, snapshotReferences: preview.snapshotReferences });
    const mutation = resolveMediaMetadataFormMutation({ expectedMediaType: "film", metadataCandidateToken: token, titleSourceToken: null, sourceChanged: false });
    const checked = await validateBookFormMutation(mutation, "film");
    if (mutation.type !== "upsert") throw new Error("Expected film mutation");
    const sourceOnly = {...mutation, snapshotReferences:undefined, facts:{}, fetchedAt:null};
    assert.deepEqual(await validateBookFormMutation(sourceOnly,"film"),sourceOnly,"source-only selection must not require a network fetch");
    assert.equal(checked.type, "upsert");
    if (checked.type !== "upsert") throw new Error("Expected checked film mutation");
    assert.deepEqual(checked.facts, saved.projection.facts, "server snapshot overrides signed client facts");
    assert.deepEqual(checked.providerSnapshot.facts, saved.projection.facts);
    const [metadata] = await client`select facts from media_item_metadata where media_item_id=1`;
    assert.equal(metadata.facts.legacyField, "preserve during transition");
    assert.equal(metadata.facts.runtimeMinutes, 123);
    assert.equal("genres" in metadata.facts, false);
    assert.equal("genreReferences" in metadata.facts, false);
    assert.equal("credits" in metadata.facts, false);
    assert.equal("future" in metadata.facts, false);
    assert.equal((await client`select title from media_items where id=1`)[0].title, "Ручное название");
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1 and genre_id=1 and is_manual`)[0].n, 1);
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1`)[0].n, 1);
    assert.deepEqual((await client`select decision,apply_status from genre_requests where provider='tmdb'`)[0], { decision: "exclude", apply_status: "processed" });
    assert.equal((await client`select count(*)::int n from creators`)[0].n, 1);
    assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1 and is_manual`)[0].n, 1);
    assert.equal((await client`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='1'`)[0].n, 1);
    const stale = preview.snapshotReferences!.map(ref => ({ ...ref, payloadHash: "0".repeat(64) }));
    await assert.rejects(upsertMediaItemMetadata({ ...base, snapshotReferences: stale }), /PROVIDER_SNAPSHOT_CHANGED/);
    await client.unsafe(`insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(1,'provider.snapshots','manual','running','active',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    await upsertMediaItemMetadata({ ...base, jobGuard: { runId: 1, lockToken: "active" }, checkpoint: { done: 1 } });
    await assert.rejects(upsertMediaItemMetadata({ ...base, snapshotReferences: stale, jobGuard: { runId: 1, lockToken: "active" }, checkpoint: { done: 2 } }), /PROVIDER_SNAPSHOT_CHANGED/);
    await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=1`;
    await assert.rejects(upsertMediaItemMetadata({ ...base, jobGuard: { runId: 1, lockToken: "active" }, checkpoint: { done: 3 } }), /STALE_SNAPSHOT_JOB/);
    assert.deepEqual((await client`select payload from job_runs where id=1`)[0].payload, { done: 1 });
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) values
      (200,'batch-film-1','Batch film 1','film','published'),(201,'batch-series','Untouched series','series','published'),(202,'batch-film-2','Batch film 2','film','published');
      insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values
      (200,'tmdb','42','{}'),(201,'tmdb','42','{"seasonCount":7}'),(202,'tmdb','42','{}');
      insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(99,'provider.snapshots','manual','running','batch-token',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
    const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
    const { JobError } = await import("../src/lib/jobs/types");
    const context = { runId: 99, lockToken: "batch-token", jobId: null, attempt: 1, source: "manual" as const, signal: new AbortController().signal };
    await assert.rejects(providerSnapshotJobHandler.execute({ ...context, payload: parseSnapshotJobPayload({
      operation: "process", provider: "tmdb", afterId: 199, throughId: 202, batchSize: 1,
    }) }), (error: unknown) => error instanceof JobError && error.code === "provider-continue");
    const [firstBatch] = await client`select payload from job_runs where id=99`;
    assert.equal(firstBatch.payload.checkpoint.afterId, 200);
    assert.equal(firstBatch.payload.checkpoint.throughId, 202);
    assert.equal(firstBatch.payload.checkpoint.processed, 1);
    await providerSnapshotJobHandler.execute({ ...context, payload: parseSnapshotJobPayload(firstBatch.payload) });
    const [lastBatch] = await client`select payload from job_runs where id=99`;
    assert.equal(lastBatch.payload.checkpoint.afterId, 202);
    assert.equal(lastBatch.payload.checkpoint.processed, 2);
    assert.equal(lastBatch.payload.checkpoint.failed, 0);
    const beforeVerify = await client`select media_item_id,facts from media_item_metadata where media_item_id between 200 and 202 order by media_item_id`;
    await providerSnapshotJobHandler.execute({ ...context, payload: parseSnapshotJobPayload({
      operation: "verify", provider: "tmdb", afterId: 199, throughId: 202,
    }) });
    const [verified] = await client`select payload from job_runs where id=99`;
    assert.equal(verified.payload.checkpoint.processed, 2);
    assert.equal(verified.payload.checkpoint.failed, 0);
    assert.deepEqual(await client`select media_item_id,facts from media_item_metadata where media_item_id between 200 and 202 order by media_item_id`, beforeVerify);
    assert.deepEqual(beforeVerify.find(row => row.media_item_id === 201)!.facts, { seasonCount: 7 });
    // Moderation must replay genre evidence from raw after facts have been compacted.
    const moderation = await import("../src/db/queries/genre-requests");
    const { saveProviderSnapshot, providerRequestStartedAt } = await import("../src/db/queries/provider-snapshots");
    const { describeTmdbFilmSource } = await import("../src/lib/providers/tmdb-film-adapter");
    const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
    const refreshRaw = async (name: string) => {
      const payload = { ...raw, genres: [{id:19,name}] };
      return saveProviderSnapshot({...describeTmdbFilmSource("42"),payload,payloadHash:snapshotHash(payload),contentType:"application/json",requestStartedAt:await providerRequestStartedAt(),fetchedAt:new Date()});
    };
    await refreshRaw("Drama");
    // Updated raw is visible before any subsequent metadata processing.
    const genreInput = {mediaItemId:1,mediaType:"film",sourceProvider:"tmdb",sourceExternalId:"42",facts:metadata.facts};
    assert.deepEqual((await service.getTmdbFilmGenreFacts(genreInput)).genres,["Drama"]);
    const refreshed = await service.getSavedTmdbFilmBundle("42");
    await upsertMediaItemMetadata({...base,snapshotReferences:[{id:refreshed.primary.id,payloadHash:refreshed.primary.payloadHash}]});
    const [drama] = await client`select id from genre_requests where provider='tmdb' and normalized_external_genre_name='drama'`;
    await client.unsafe("insert into genres(id,slug,name,is_active) values(2,'drama','Драма',true)");
    const mapped = await moderation.resolveGenreRequest({requestId:drama.id,adminId:1,decision:"map",genreIds:[2]});
    await moderation.applyGenreRequest(drama.id,{jobRunId:mapped.jobRunId});
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1 and genre_id=2 and not is_manual`)[0].n,1);
    await client`update job_runs set status='succeeded' where id=${mapped.jobRunId}`;
    const [mapping] = await client`select id from provider_genre_mappings where provider='tmdb' and normalized_external_genre_name='drama'`;
    const reopened = await moderation.reopenGenreMapping({mappingId:mapping.id,adminId:1});
    await moderation.applyGenreRequest(drama.id,{jobRunId:reopened.jobRunId});
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1 and genre_id=2`)[0].n,0);
    await client`update job_runs set status='succeeded' where id=${reopened.jobRunId}`;
    const excluded = await moderation.resolveGenreRequest({requestId:drama.id,adminId:1,decision:"exclude"});
    await moderation.applyGenreRequest(drama.id,{jobRunId:excluded.jobRunId});
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1 and genre_id=1 and is_manual`)[0].n,1);
    assert.equal((await client`select count(*)::int n from media_item_genres where media_item_id=1`)[0].n,1);
    const [compact] = await client`select facts from media_item_metadata where media_item_id=1`;
    assert.equal("genres" in compact.facts,false);
    assert.equal("genreReferences" in compact.facts,false);
    // A missing or unrelated linked raw cannot be treated as an empty genre list.
    const linked = await client`delete from provider_snapshot_links where entity_type='media-item' and entity_id='1' returning *`;
    const linksBefore = await client`select * from media_item_genres where media_item_id=1 order by genre_id`;
    await assert.rejects(moderation.applyGenreRequest(drama.id),/PROVIDER_SNAPSHOT_MISSING/);
    assert.deepEqual(await client`select * from media_item_genres where media_item_id=1 order by genre_id`,linksBefore);
    assert.deepEqual(await service.getTmdbFilmGenreFacts({...genreInput,facts:{genres:["Legacy"]}}),{genres:["Legacy"]},"transition fallback needs explicit genre evidence");
    for(const link of linked) await client`insert into provider_snapshot_links ${client(link)}`;
    // Measure the actual generated helper query with 100k raw resources and
    // three entity links each; raw payload size does not affect identity access.
    await client.unsafe(`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
      select 'tmdb','movie',(g+1000000)::text,'movie.details','{}','synthetic-'||g,'{"id":42,"credits":{"cast":[],"crew":[]},"genres":[]}', 'application/json',repeat('a',64),now(),now() from generate_series(1,100000)g;
      insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose)
      select id,'media-item','synthetic-'||id||'-'||n,'primary' from provider_snapshots cross join generate_series(1,3)n where request_key like 'synthetic-%';
      analyze provider_snapshots; analyze provider_snapshot_links;`);
    const queries:Array<{query:string;params:unknown[]}>=[];
    client.options.debug=(_connection,query,params)=>{if(query.startsWith('select') && query.includes('provider_snapshot_links'))queries.push({query,params:[...params]});};
    await service.getTmdbFilmGenreFacts(genreInput);
    await assert.rejects(service.getTmdbFilmGenreFacts({...genreInput,mediaItemId:99999999}),/PROVIDER_SNAPSHOT_MISSING/);
    client.options.debug=false;
    assert.equal(queries.length,2);
    for(const query of queries) {
      const [explained]=await client.unsafe("explain(analyze,buffers,format json) "+query.query,query.params as never[]);
      const plan=explained["QUERY PLAN"][0];
      t.diagnostic(JSON.stringify({genreEvidence:true,snapshots:100001,links:300003,executionMs:plan["Execution Time"],plan:plan.Plan}));
      assert.doesNotMatch(JSON.stringify(plan),/"Node Type":"Seq Scan"/);
      assert.match(JSON.stringify(plan),/Index Only Scan|Index Scan/);
      assert.match(JSON.stringify(plan),/entity_type.*entity_id.*purpose/);
      assert.match(JSON.stringify(plan),/Shared Hit Blocks/);
    }
    globalThis.fetch = async () => Response.json({id:99,runtime:null,original_language:null,production_companies:[],production_countries:[],genres:[{id:18,name:"Genre only"}],credits:{cast:[],crew:[]}});
    const genreOnly = await getTitleMetadata({provider:"tmdb",externalId:"99",mediaType:"film"},undefined,{
      candidateLimit:1,tmdbResultScanLimit:1,providerCredentials:{tmdb:{accessToken:"test-token"}},
    });
    assert.equal(genreOnly.error,null);
    assert.ok(genreOnly.metadata,"genre-only raw remains actionable despite empty compact facts");
    assert.deepEqual(genreOnly.metadata.facts,{});
    assert.deepEqual(genreOnly.metadata.genreFacts?.genres,["Genre only"]);
    assert.equal(calls, 1);
  } finally {
    client.options.debug=false;
    globalThis.fetch = originalFetch;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
