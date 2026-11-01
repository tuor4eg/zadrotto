import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { describeAniListCreators } from "../src/lib/providers/anilist-creators-adapter";
import { describeAniListMetadata } from "../src/lib/providers/anilist-metadata-adapter";
import { snapshotHash } from "../src/lib/providers/snapshot-values";
import type { JSONValue, SnapshotDescriptor } from "../src/lib/providers/types";
import type { SnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";

const testUrl = process.env.ANILIST_PRIMARY_TEST_DATABASE_URL;
const redisUrl = process.env.ANILIST_PRIMARY_TEST_REDIS_URL;
test("AniList primary migration preserves creators, repairs links offline and applies primary facts with resumable jobs", { skip: !testUrl || !redisUrl }, async t => {
  const schema = `anilist_primary_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString(); process.env.REDIS_URL = redisUrl;
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const { closeRedisClient, getRedisClient } = await import("../src/lib/services/redis");
  const { repairAniListCreatorSnapshotLinks } = await import("../src/db/queries/anilist-metadata");
  const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
  const { getMediaItemsMissingMetadata, upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { getTitleMetadata } = await import("../src/lib/covers/registry");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let unavailable = false;
  let sourceChange = false;
  let invalidateLease: number | null = null;
  const response = (id: number) => ({ data: { Media: { id, idMal: id + 1000, episodes: 24, duration: 23, status: "FINISHED", format: "TV", genres: [],
    title: { english: "Provider title" }, description: "Provider description", unknown: { retained: [true, null, 7] } } } });
  const save = async (descriptor: SnapshotDescriptor, payload: JSONValue) => {
    const [row] = await admin`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,payload_hash,content_type,request_started_at,fetched_at)
      values(${descriptor.providerCode},${descriptor.resourceType},${descriptor.externalId},${descriptor.apiMethod},${admin.json(descriptor.requestParams)},${snapshotHash(descriptor.requestParams)},${admin.json(payload)},${snapshotHash(payload)},'application/json',now(),now()) returning id`;
    return { id: Number(row.id), payloadHash: snapshotHash(payload) };
  };
  const facts = async (id: number) => (await admin`select facts from media_item_metadata where media_item_id=${id}`)[0].facts;
  const job = async (operation: SnapshotJobPayload["operation"], ids: number[], extra: Partial<SnapshotJobPayload> = {}) => {
    const payload: SnapshotJobPayload = { mediaType: "anime", provider: "anilist", animeSnapshot: "metadata", operation, mediaItemIds: ids, ...extra };
    const [run] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values('provider.snapshots','running','manual',${admin.json(payload)},'lease',now()+interval '10 minutes',now(),now(),3,300,60,3600) returning id`;
    return { id: Number(run.id), payload };
  };
  const execute = (run: { id: number; payload: SnapshotJobPayload }, signal = new AbortController().signal) => providerSnapshotJobHandler.execute({ runId: run.id, payload: run.payload, lockToken: "lease", source: "manual", attempt: 1, jobId: null, signal });
  const resume = async (id: number) => ({ id, payload: (await admin`select payload from job_runs where id=${id}`)[0].payload as SnapshotJobPayload });
  try {
    await admin.unsafe(`create schema ${schema}; set search_path=${schema},public`);
    const tables = await admin<{ tablename: string }[]>`select tablename from pg_tables where schemaname='public'`;
    for (const { tablename } of tables) await admin.unsafe(`create unlogged table ${schema}."${tablename.replaceAll('"', '""')}" (like public."${tablename.replaceAll('"', '""')}" including all)`);
    const serials = await admin`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for (const [index, column] of serials.entries()) {
      await admin.unsafe(`create sequence ${schema}.test_serial_${index} start 1000000`);
      await admin.unsafe(`alter table "${column.table_name}" alter column "${column.column_name}" set default nextval('${schema}.test_serial_${index}')`);
    }
    await admin`insert into creator_types select * from public.creator_types`;
    await admin`insert into creator_roles select * from public.creator_roles`;
    await admin`insert into provider_settings(media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority) values('anime','anilist',true,'parallel',true,1)`;
    await admin`insert into media_items(id,code,title,description,media_type,publication_status) select n,'primary-'||n,'Original '||n,'Keep description','anime','published' from generate_series(1,10)n`;
    await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts,fetched_at) select n,'anilist',(100+n)::text,'{"episodeCount":12,"anilistCreatorsComplete":true,"keep":"legacy"}',now() from generate_series(1,10)n`;
    await admin`update media_item_metadata set source_provider='jikan' where media_item_id=10`;
    const roster = await save(describeAniListCreators("101"), { mediaId: 101, idMal: 1101, complete: true, staff: [{ id: 77, name: "Director", role: "Director" }], studios: [] });
    await admin`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${roster.id},'media-item','1','primary')`;
    const [person] = await admin`select id from creator_types where code='person'`;
    const [role] = await admin`select id from creator_roles where code='director'`;
    const [creator] = await admin`insert into creators(name,slug,type_id) values('Existing director','existing-director',${person.id}) returning id`;
    await admin`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values('anilist','person:77',${creator.id})`;
    await admin`insert into entry_creators(entry_id,creator_id,role_id,is_manual) values(1,${creator.id},${role.id},true)`;
    globalThis.fetch = async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      assert.match(request.query, /query Anime\(/); assert.doesNotMatch(request.query, /staff\(/);
      if (sourceChange) await admin`update media_item_metadata set source_external_id='999' where media_item_id=4`;
      if (invalidateLease) await admin`update job_runs set lock_expires_at=now()-interval '1 second' where id=${invalidateLease}`;
      return unavailable ? new Response(null, { status: 503 }) : Response.json(response(Number(request.variables.id)));
    };
    await t.test("move an existing creator snapshot offline and idempotently without changing working data", async () => {
      const before = await facts(1);
      const creators = await admin`select * from creators`;
      const links = await admin`select * from entry_creators`;
      await repairAniListCreatorSnapshotLinks(1, "101");
      assert.equal(calls, 0);
      assert.deepEqual(await facts(1), before);
      assert.deepEqual(await admin`select * from creators`, creators);
      assert.deepEqual(await admin`select * from entry_creators`, links);
      assert.deepEqual((await admin`select purpose from provider_snapshot_links where snapshot_id=${roster.id}`).map(row => row.purpose), ["dependency"]);
      await admin`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${roster.id},'media-item','1','primary')`;
      await repairAniListCreatorSnapshotLinks(1, "101"); await repairAniListCreatorSnapshotLinks(1, "101");
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where snapshot_id=${roster.id}`)[0].n, 1);
      assert.equal(calls, 0);
    });
    await t.test("load only the primary response, preserve its raw envelope and update facts automatically", async () => {
      assert.ok((await getMediaItemsMissingMetadata({ mediaItemId: 1 })).length);
      await execute(await job("refresh-process", [1], { onlyMissingSnapshots: true }));
      assert.equal(calls, 1);
      assert.deepEqual(await facts(1), { episodeCount: 24, averageEpisodeRuntimeMinutes: 23, status: "FINISHED", animeType: "TV", anilistCreatorsComplete: true, keep: "legacy" });
      const [raw] = await admin`select s.payload from provider_snapshots s inner join provider_snapshot_links l on l.snapshot_id=s.id where l.entity_id='1' and l.purpose='primary'`;
      assert.deepEqual(raw.payload, response(101));
      assert.equal((await admin`select count(*)::int n from creators`)[0].n, 1);
      assert.equal((await admin`select count(*)::int n from entry_creators where entry_id=1 and is_manual`)[0].n, 1);
      assert.equal((await admin`select title,description from media_items where id=1`)[0].description, "Keep description");
      assert.deepEqual(await getMediaItemsMissingMetadata({ mediaItemId: 1 }), []);
      await execute(await job("refresh-process", [1], { onlyMissingSnapshots: true }));
      await execute(await job("process", [1])); await execute(await job("verify", [1]));
      assert.equal(calls, 1);
    });
    await t.test("backfill reuses unattached primary evidence and accepts an empty valid projection", async () => {
      const empty = response(102); Object.assign(empty.data.Media, { episodes: null, duration: null, status: null, format: null });
      const ref = await save(describeAniListMetadata("102"), empty);
      const result = await getTitleMetadata({ provider: "anilist", externalId: "102", mediaType: "anime", reuseSavedSnapshot: true });
      assert.equal(result.error, null); assert.deepEqual(result.metadata?.facts, {}); assert.equal(calls, 1);
      const oldFacts = await facts(2);
      await execute(await job("refresh", [2], { onlyMissingSnapshots: true }));
      assert.deepEqual(await facts(2), oldFacts, "refresh-only attaches the primary response without applying it");
      assert.equal(calls, 1);
      await admin`delete from provider_snapshot_links where entity_id='2' and purpose='primary'`;
      const { backfillMediaMetadata } = await import("../src/lib/media/metadata-backfill");
      const backfill = await backfillMediaMetadata({ mediaItemId: 2 });
      assert.equal(backfill.updated, 1); assert.equal(calls, 1);
      await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "anilist", sourceExternalId: "102", facts: { forged: true }, snapshotReferences: [ref] });
      assert.deepEqual(await facts(2), { keep: "legacy", anilistCreatorsComplete: true });
      assert.deepEqual(await getMediaItemsMissingMetadata({ mediaItemId: 2 }), []);
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "anilist", sourceExternalId: "103", facts: {}, snapshotReferences: [ref] }), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
    });
    await t.test("failed primary loading preserves legacy facts and the already repaired dependency", async () => {
      const ref = await save(describeAniListCreators("103"), { mediaId: 103, idMal: null, complete: true, staff: [], studios: [] });
      await admin`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${ref.id},'media-item','3','primary')`;
      const before = await facts(3); unavailable = true;
      const run = await job("refresh-process", [3], { onlyMissingSnapshots: true });
      await assert.rejects(execute(run), /Повторная попытка/);
      assert.deepEqual(await facts(3), before);
      assert.deepEqual((await admin`select purpose from provider_snapshot_links where snapshot_id=${ref.id}`).map(row => row.purpose), ["dependency"]);
      assert.equal((await resume(run.id)).payload.checkpoint?.retryId, 3);
      unavailable = false; await execute(await resume(run.id));
      assert.equal((await resume(run.id)).payload.checkpoint?.afterId, 3);
    });
    await t.test("source changes, ambiguous links and expired leases cannot apply stale evidence", async () => {
      sourceChange = true; const before = await facts(4);
      const run = await job("refresh-process", [4]);
      await assert.rejects(execute(run), /Обработка завершена с ошибками/); sourceChange = false;
      assert.deepEqual(await facts(4), before);
      assert.equal((await resume(run.id)).payload.checkpoint?.errors[0].code, "source-changed");
      await admin`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${roster.id},'media-item','5','primary')`;
      const beforeCalls = calls;
      const invalid = await job("refresh-process", [5]);
      await assert.rejects(execute(invalid), /Обработка завершена с ошибками/);
      assert.equal(calls, beforeCalls);
      assert.equal((await admin`select purpose from provider_snapshot_links where entity_id='5'`)[0].purpose, "primary");
      const otherRoster = await save(describeAniListCreators("105"), { mediaId: 105, idMal: null, complete: true, staff: [], studios: [] });
      await admin`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${otherRoster.id},'media-item','5','primary')`;
      const ambiguous = await job("refresh-process", [5]);
      await assert.rejects(execute(ambiguous), /Обработка завершена с ошибками/);
      assert.equal((await resume(ambiguous.id)).payload.checkpoint?.errors[0].code, "anilist-ambiguous");
      assert.equal(calls, beforeCalls);
      const expired = await job("refresh-process", [6]); invalidateLease = expired.id;
      await assert.rejects(execute(expired), /STALE_SNAPSHOT_JOB/); invalidateLease = null;
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_id='6'`)[0].n, 0);
      const controller = new AbortController(); controller.abort();
      await assert.rejects(execute(await job("refresh-process", [7]), controller.signal), /abort/i);
    });
    await t.test("batch continuation preserves metadata scope, resumes and excludes Jikan", async () => {
      const run = await job("refresh-process", [8, 9, 10], { batchSize: 1, batchPauseHours: 0.5, onlyMissingSnapshots: true });
      await assert.rejects(execute(run), error => error instanceof Error && "code" in error && error.code === "provider-continue");
      const continued = await resume(run.id);
      assert.equal(continued.payload.animeSnapshot, "metadata"); assert.equal(continued.payload.checkpoint?.afterId, 8);
      await execute(continued);
      assert.equal((await resume(run.id)).payload.checkpoint?.processed, 2);
      assert.equal((await facts(10)).episodeCount, 12);
      const { refreshStaleMediaMetadata } = await import("../src/lib/media/metadata-refresh");
      await admin`update media_item_metadata set fetched_at=now()-interval '91 days' where media_item_id=8`;
      const beforeRefresh = calls;
      const refreshed = await refreshStaleMediaMetadata({ mediaItemId: 8 });
      assert.equal(refreshed.updated, 1); assert.equal(calls, beforeRefresh + 1);
      const redis = await getRedisClient();
      assert.ok(redis); await redis.del("anilist:api:request-slot:v1");
      const { fetchAniListMetadata } = await import("../src/lib/providers/anilist-metadata-service");
      const before = calls;
      await assert.rejects(fetchAniListMetadata({ provider: "anilist", externalId: "108", mediaType: "anime" }, { candidateLimit: 1, tmdbResultScanLimit: 1, beforeProviderSearch: async () => "provider-daily-limit" }), /provider-daily-limit/);
      assert.equal(calls, before);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await closeRedisClient(); await dbClient.end();
    await admin.unsafe(`drop schema ${schema} cascade`); await admin.end();
  }
});
