import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { bggProjectionLegacyFacts, describeBggSource, normalizeBggSnapshot } from "../src/lib/providers/bgg-adapter";
import { createBggRuntime, type BggRedis } from "../src/lib/covers/providers/bgg-runtime";
import { JobError } from "../src/lib/jobs/types";
import type { SnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";
import { bggSnapshotXml } from "./bgg-snapshot-fixtures";
import { getSnapshotDifferences } from "../src/lib/providers/snapshot-diff";

const testUrl = process.env.BGG_SNAPSHOT_TEST_DATABASE_URL;
test("BGG raw ownership and guarded transfer preserve existing moderation and working data", { skip: !testUrl }, async t => {
  const schema = `bgg_snapshot_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const service = await import("../src/lib/providers/bgg-service");
  const core = await import("../src/db/queries/provider-snapshots");
  const { upsertMediaItemMetadata, getMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { transferBggSnapshot } = await import("../src/db/queries/bgg-snapshot-transfer");
  const redisValues = new Map<string, string>();
  const redis = { async get(key: string) { return redisValues.get(key) ?? null; }, async set(key: string, value: string) { redisValues.set(key, value); return "OK"; }, async eval() { return 0; } } as unknown as BggRedis;
  const runtime = createBggRuntime({ redis: async () => redis });
  let payload = bggSnapshotXml();
  let networkRequests = 0;
  const fetchRaw = () => service.fetchBggMetadata({ provider: "bgg", externalId: "42", mediaType: "boardgame" }, { providerCredentials: { bgg: { accessToken: "test-only" } }, signal: new AbortController().signal }, { runtime, fetch: async () => { networkRequests++; return new Response(payload, { headers: { "content-type": "application/xml" } }); } });
  const metadata = () => admin`select * from media_item_metadata where media_item_id=1`;
  const protectedState = () => Promise.all([
    admin`select * from media_item_genres order by media_item_id,genre_id`,
    admin`select * from entry_creators order by entry_id,creator_id,role_id`,
    admin`select * from entry_creator_sources order by entry_id,creator_id,role_id,provider`,
    admin`select * from creator_requests order by id`,
    admin`select * from creator_request_media_items order by request_id,media_item_id,role_id`,
    admin`select * from provider_creator_bindings order by id`,
    admin`select * from provider_creator_exclusions order by id`,
    admin`select * from genre_requests order by id`,
    admin`select * from genre_request_media_items order by request_id,media_item_id`,
    admin`select * from provider_genre_mappings order by id`,
    admin`select * from media_item_title_aliases order by id`,
    admin`select * from job_runs order by id`,
  ]);
  try {
    await admin.unsafe(`create schema ${schema};set search_path=${schema},public`);
    const tables = await admin<{ tablename: string }[]>`select tablename from pg_tables where schemaname='public'`;
    for (const { tablename } of tables) await admin.unsafe(`create unlogged table ${schema}."${tablename.replaceAll('"', '""')}" (like public."${tablename.replaceAll('"', '""')}" including all)`);
    const serials = await admin`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for (const [index, column] of serials.entries()) {
      await admin.unsafe(`create sequence ${schema}.test_serial_${index} start 1000000`);
      await admin.unsafe(`alter table "${column.table_name}" alter column "${column.column_name}" set default nextval('${schema}.test_serial_${index}')`);
    }
    await admin`insert into creator_types select * from public.creator_types`;
    await admin`insert into creator_roles select * from public.creator_roles`;
    await admin`insert into admin_users(id,login,password_hash) values(1,'bgg-test','unused')`;
    await admin`insert into media_items(id,code,title,media_type,publication_status) values(1,'raw-bgg','Keep local title','boardgame','published')`;
    await admin`insert into media_item_title_aliases(media_item_id,value) values(1,'Keep manual alias')`;
    await admin`insert into creators(id,name,name_ru,name_ru_source,slug,type_id) select 50,'Designer','Автор','manual','bgg-designer',id from creator_types where code='person'`;
    await admin`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values('bgg','101','Designer',50)`;
    await admin`insert into genres(id,slug,name) values(80,'animals','Животные')`;
    await admin`insert into provider_genre_mappings(provider,media_type,external_genre_id,external_genre_name,normalized_external_genre_name,genre_id) values('bgg','boardgame','7','Animals','animals',80)`;
    await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'bgg','42','{"custom":{"keep":true}}')`;

    await t.test("fetch saves exact XML but does not change working metadata, titles or aliases", async () => {
      const before = await metadata();
      const protectedBefore = await protectedState();
      const raw = await fetchRaw();
      assert.deepEqual(await metadata(), before);
      assert.deepEqual(await protectedState(), protectedBefore);
      assert.deepEqual(raw.fields?.aliases, ["Крылья"]);
      const saved = await core.getProviderSnapshot(describeBggSource("42"));
      assert.equal(saved?.payload, payload);
      assert.equal(saved?.contentType, "application/xml");
      assert.equal((await admin`select title from media_items where id=1`)[0].title, "Keep local title");
      await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "bgg", sourceExternalId: "42", facts: {}, snapshotReferences: raw.snapshotReferences, enqueueCompanyLogos: false });
      assert.equal((await metadata())[0].facts.bggSnapshotProcessed, true);
      for (const key of ["authors", "artists", "bggCreators", "genres", "genreReferences"]) assert.equal(key in (await metadata())[0].facts, false);
      assert.deepEqual((await admin`select value from media_item_title_aliases where media_item_id=1`).map(row => row.value), ["Keep manual alias"]);
    });
    await t.test("safe transfer preserves relations and decisions, cleans duplicates and repeats without writes", async () => {
      const bundle = await service.getSavedBggBundle("42");
      const legacy = { ...bggProjectionLegacyFacts(bundle.projection), custom: { keep: true } };
      await admin`update media_item_metadata set facts=${admin.json(legacy)} where media_item_id=1`;
      await admin`delete from provider_snapshot_links where entity_type='media-item' and entity_id='1'`;
      const refs = [{ id: bundle.primary.id, payloadHash: bundle.primary.payloadHash }];
      const input = { mediaItemId: 1, externalId: "42", refs, expectedSource: { provider: "bgg", externalId: "42" } };
      const before = await protectedState();
      const beforeMetadata = await metadata();
      await admin.unsafe(`create function ${schema}.fail_bgg_transfer() returns trigger language plpgsql as $$ begin raise exception 'TEST_BGG_ROLLBACK'; end $$; create trigger fail_bgg_transfer before update on media_item_metadata for each row execute function ${schema}.fail_bgg_transfer()`);
      await assert.rejects(transferBggSnapshot(input), error => error instanceof Error && error.cause instanceof Error && /TEST_BGG_ROLLBACK/.test(error.cause.message));
      assert.deepEqual(await metadata(), beforeMetadata);
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='1'`)[0].n, 0);
      await admin.unsafe("drop trigger fail_bgg_transfer on media_item_metadata");
      await transferBggSnapshot(input);
      assert.deepEqual(await protectedState(), before);
      const transferred = await metadata();
      assert.deepEqual(transferred[0].facts, { ...bundle.projection.facts, custom: { keep: true }, bggSnapshotProcessed: true, bggSnapshotHash: bundle.primary.payloadHash });
      await transferBggSnapshot(input);
      assert.deepEqual(await metadata(), transferred);
      assert.deepEqual(await protectedState(), before);
      const reading = await getMediaItemMetadata(1);
      assert.deepEqual(reading?.facts.authors, ["Автор"]);
      assert.deepEqual(reading?.facts.artists, ["Автор"]);
      const comparison = await service.getBggMigrationComparison(1,bundle.projection);
      assert.deepEqual(comparison.blockers, [], "localized display names must not create a false identity difference");
      assert.deepEqual(getSnapshotDifferences(comparison.preview.current,comparison.preview.proposed),[], "display diff compares normalized relations and omits technical snapshot markers");
      assert.deepEqual((await service.getBggSnapshotFacts({ ...(await metadata())[0], mediaItemId: 1, mediaType: "boardgame", sourceProvider: "bgg", sourceExternalId: "42" })).bggCreators, bundle.projection.creatorReferences);
      await admin`delete from provider_snapshot_links where entity_type='media-item' and entity_id='1'`;
      assert.deepEqual((await getMediaItemMetadata(1))?.facts, reading?.facts, "normalized rendering cannot require raw availability");
      await transferBggSnapshot(input);
    });
    await t.test("ordinary moderation uses the current applied hash without changing manual aliases", async () => {
      const { applyCreatorRequest } = await import("../src/db/queries/creator-requests");
      const { applyGenreRequest } = await import("../src/db/queries/genre-requests");
      const [creatorRequest] = await admin`select id from creator_requests where provider='bgg' and external_creator_id='101'`;
      await applyCreatorRequest(creatorRequest.id);
      await admin`insert into genre_requests(provider,media_type,external_genre_name,normalized_external_genre_name,decision,apply_status,resolved_at,resolved_by_admin_id) values('bgg','boardgame','Animals','animals','map','processed',now(),1) on conflict do nothing`;
      const [genreRequest] = await admin`select id from genre_requests where provider='bgg' and media_type='boardgame' and normalized_external_genre_name='animals'`;
      await admin`insert into genre_request_media_items(request_id,media_item_id,external_genre_name,external_genre_id) values(${genreRequest.id},1,'Animals','7') on conflict do nothing`;
      await applyGenreRequest(genreRequest.id);
      assert.deepEqual((await getMediaItemMetadata(1))?.facts.authors, ["Автор"]);
      assert.deepEqual((await admin`select value from media_item_title_aliases where media_item_id=1`).map(row => row.value), ["Keep manual alias"]);
    });
    await t.test("differences and stale evidence never replace working metadata or decisions", async () => {
      const original = await service.getSavedBggBundle("42");
      payload = bggSnapshotXml("42", { designerId: "102", designerName: "Other Designer" });
      const changed = await fetchRaw();
      const before = await protectedState();
      const beforeMetadata = await metadata();
      const input = { mediaItemId: 1, externalId: "42", refs: changed.snapshotReferences!, expectedSource: { provider: "bgg", externalId: "42" } };
      await assert.rejects(transferBggSnapshot(input), error => error instanceof Error && error.message === "BGG_SNAPSHOT_DIFFERENCE" && "diagnostics" in error && Array.isArray(error.diagnostics) && error.diagnostics.length > 0);
      await assert.rejects(service.getBggSnapshotFacts({ ...beforeMetadata[0], mediaItemId: 1, mediaType: "boardgame", sourceProvider: "bgg", sourceExternalId: "42" }), /PROVIDER_SNAPSHOT_CHANGED/, "moderation cannot use raw rejected by safe transfer");
      assert.deepEqual(await protectedState(), before);
      assert.deepEqual(await metadata(), beforeMetadata);
      await assert.rejects(transferBggSnapshot({ ...input, refs: [{ id: original.primary.id, payloadHash: original.primary.payloadHash }] }), /PROVIDER_SNAPSHOT_CHANGED/);
      await assert.rejects(transferBggSnapshot({ ...input, expectedSource: { provider: "bgg", externalId: "999" } }), /PROVIDER_SOURCE_CHANGED/);
      const [expired] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual','{}','expired',now()-interval '1 second',now(),now(),3,300,60,3600) returning id`;
      await assert.rejects(transferBggSnapshot({ ...input, jobGuard: { runId: expired.id, lockToken: "expired" } }), /STALE_SNAPSHOT_JOB/);
      const savedPayload = payload;
      await admin`update provider_snapshots set payload=${admin.json(bggSnapshotXml("42", { empty: true }))} where id=${changed.snapshotReferences![0].id}`;
      await assert.rejects(transferBggSnapshot(input), /PROVIDER_SNAPSHOT_CHANGED/);
      await admin`update provider_snapshots set payload=${admin.json(savedPayload)} where id=${changed.snapshotReferences![0].id}`;
      assert.deepEqual(await metadata(), beforeMetadata);
      payload = "<items><item></items>";
      await assert.rejects(fetchRaw());
      assert.equal((await core.getProviderSnapshot(describeBggSource("42")))?.payload, savedPayload);
      await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "bgg", sourceExternalId: "42", facts: {}, snapshotReferences: changed.snapshotReferences, enqueueCompanyLogos: false });
      const applied = (await metadata())[0];
      assert.equal(applied.facts.bggSnapshotHash, changed.snapshotReferences![0].payloadHash);
      assert.deepEqual((await service.getBggSnapshotFacts({ ...applied, mediaItemId: 1, mediaType: "boardgame", sourceProvider: "bgg", sourceExternalId: "42" })).bggCreators, [{ externalId: "102", name: "Other Designer", roleCode: "designer" }, { externalId: "102", name: "Other Designer", roleCode: "artist" }]);
      const comparison = await service.getBggMigrationComparison(1,(await service.getSavedBggBundle("42")).projection);
      assert.deepEqual(getSnapshotDifferences(comparison.preview.current,comparison.preview.proposed),[], "existing pending participants are not shown as new additions after applying");
    });
    await t.test("actual BGG jobs transfer unchanged state offline, skip differences and require explicit application", async () => {
      const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
      const initialXml = bggSnapshotXml("142", { empty: true });
      const initial = normalizeBggSnapshot({ providerCode: "bgg", externalId: "142", payload: initialXml });
      await admin`insert into media_items(id,code,title,media_type,publication_status) values(2,'bgg-job','Job local title','boardgame','published')`;
      await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(2,'bgg','142',${admin.json(bggProjectionLegacyFacts(initial))})`;
      const save = (xml: string) => core.saveProviderSnapshot({ ...describeBggSource("142"), payload: xml, payloadHash: "ignored", contentType: "application/xml", requestStartedAt: new Date(), fetchedAt: new Date() });
      const job = async (applyBoardgameChanges = false) => {
        const payload = { mediaType: "boardgame", provider: "bgg", operation: "process", mediaItemIds: [2], ...(applyBoardgameChanges ? { applyBoardgameChanges: true } : {}) } as SnapshotJobPayload;
        const [run] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual',${admin.json(payload)},'bgg-lease',now()+interval '10 minutes',now(),now(),3,300,60,3600) returning id`;
        return { id: Number(run.id), payload };
      };
      const execute = (run: { id: number; payload: SnapshotJobPayload }) => providerSnapshotJobHandler.execute({ runId: run.id, payload: run.payload, lockToken: "bgg-lease", source: "manual", attempt: 1, jobId: null, signal: new AbortController().signal });
      const checkpoint = async (id: number) => (await admin`select payload from job_runs where id=${id}`)[0].payload.checkpoint;
      await save(initialXml);
      const originalFetch = globalThis.fetch;
      const previousRequests = networkRequests;
      let unexpectedRequests = 0;
      globalThis.fetch = async () => { unexpectedRequests++; throw new Error("UNEXPECTED_BGG_OFFLINE_HTTP"); };
      try {
        const safe = await job();
        const before = await protectedState();
        await execute(safe);
        assert.equal((await checkpoint(safe.id)).processed, 1);
        const after = await protectedState();
        assert.deepEqual(after.slice(0, -1), before.slice(0, -1));
        assert.equal(after.at(-1)!.length, before.at(-1)!.length, "safe transfer creates no downstream jobs");
        const transferred = await admin`select * from media_item_metadata where media_item_id=2`;
        await save(bggSnapshotXml("142", { designerId: "103", designerName: "New Designer" }));
        const difference = await job();
        await assert.rejects(execute(difference), error => error instanceof JobError && error.code === "snapshot-items-failed");
        assert.equal((await checkpoint(difference.id)).failed, 1);
        assert.equal((await checkpoint(difference.id)).errors[0].code, "bgg-snapshot-difference");
        assert.deepEqual(await admin`select * from media_item_metadata where media_item_id=2`, transferred);
        const apply = await job(true);
        await execute(apply);
        assert.equal((await checkpoint(apply.id)).processed, 1);
        assert.equal((await admin`select count(*)::int n from creator_request_media_items o join creator_requests r on r.id=o.request_id where o.media_item_id=2 and r.external_creator_id='103'`)[0].n, 2);
        assert.equal(unexpectedRequests, 0);
        assert.equal(networkRequests, previousRequests);
        assert.deepEqual((await admin`select value from media_item_title_aliases where media_item_id=1`).map(row => row.value), ["Keep manual alias"]);
      } finally { globalThis.fetch = originalFetch; }
    });
    await t.test("mapped Russian genres and existing unknown-genre requests disappear from the apply diff", async () => {
      const xml = bggSnapshotXml("242",{extra:'<link type="boardgamecategory" id="1037" value="Real-time"/>'});
      const snapshot = await core.saveProviderSnapshot({...describeBggSource("242"),payload:xml,payloadHash:"ignored",contentType:"application/xml",requestStartedAt:new Date(),fetchedAt:new Date()});
      const projection = normalizeBggSnapshot({...describeBggSource("242"),payload:xml});
      await admin`insert into media_items(id,code,title,media_type,publication_status) values(3,'bgg-preview','Preview','boardgame','published')`;
      await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(3,'bgg','242','{}')`;
      const before = await service.getBggMigrationComparison(3,projection);
      assert.ok(getSnapshotDifferences(before.preview.current,before.preview.proposed).some(row => row.path.startsWith("жанры без соответствий")));
      await upsertMediaItemMetadata({mediaItemId:3,sourceProvider:"bgg",sourceExternalId:"242",facts:{},snapshotReferences:[{id:snapshot.id,payloadHash:snapshot.payloadHash}],enqueueCompanyLogos:false});
      const after = await service.getBggMigrationComparison(3,projection);
      assert.deepEqual(getSnapshotDifferences(after.preview.current,after.preview.proposed),[]);
      assert.deepEqual(after.preview.current.жанры,[{id:80,name:"Животные"}]);
      assert.deepEqual(after.preview.current["жанры без соответствий"],[{id:"1037",name:"Real-time"}]);
      assert.equal((await admin`select decision from genre_requests where provider='bgg' and normalized_external_genre_name='real-time'`)[0].decision,null);
    });
  } finally {
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(), admin.end()]);
  }
});
