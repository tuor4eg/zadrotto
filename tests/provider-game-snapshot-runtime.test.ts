import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { describeGameSource } from "../src/lib/providers/game-adapter";
import type { SnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";
import { JobError } from "../src/lib/jobs/types";

const testUrl = process.env.GAME_SNAPSHOT_TEST_DATABASE_URL;

test("game raw processing preserves evidence and applies guarded normalized relations offline", { skip: !testUrl }, async t => {
  const schema = `game_snapshot_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const service = await import("../src/lib/providers/game-service");
  const snapshots = await import("../src/db/queries/provider-snapshots");
  const { upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { resolveCreatorRequest } = await import("../src/db/queries/creator-requests");
  let requests = 0;
  let payload: Record<string, unknown> = { id: 42, name: "Raw game", genres: [{ id: 5, name: "RPG" }], platforms: [{ platform: { id: 4, name: "PC" } }], developers: [{ id: 7, name: "Same Studio" }], publishers: [{ id: 7, name: "Same Studio" }], unknown: { nested: [null, true, 7] } };
  const fetchRaw = () => service.fetchGameMetadata({ mediaType: "game", provider: "rawg", externalId: "42" }, { signal: new AbortController().signal, providerCredentials: { rawg: { apiKey: "test-only" } } }, {
    rawgRequest: async <T>() => { requests++; return structuredClone(payload) as T; },
  });
  const persisted = () => admin`select * from media_item_metadata where media_item_id=1`;
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
    await admin`insert into admin_users(id,login,password_hash) values(1,'game-test','unused')`;
    await admin`insert into media_items(id,code,title,media_type,publication_status) values(1,'game-raw','Keep title','game','published'),(2,'game-legacy','Legacy','game','published')`;
    await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'rawg','42','{"developers":["Legacy Studio"],"genres":["Legacy genre"],"custom":{"keep":true}}'),(2,'rawg','99','{"developers":["Legacy only"]}')`;

    await t.test("fetch preserves complete raw without applying metadata; processing is offline", async () => {
      const before = await persisted();
      const fetched = await fetchRaw();
      assert.deepEqual(await persisted(), before);
      assert.deepEqual(fetched.facts, {});
      assert.ok(fetched.snapshotReferences?.length);
      const saved = await snapshots.getProviderSnapshot(describeGameSource("rawg", "42"));
      assert.deepEqual(saved?.payload, payload);
      assert.deepEqual(await service.getGameSnapshotFacts({ mediaItemId: 1, mediaType: "game", sourceProvider: "rawg", sourceExternalId: "42", facts: before[0].facts }), before[0].facts, "refresh alone must preserve the legacy moderation source");
      await admin`insert into creators(id,name,slug,type_id) select 50,'Manual Developer','manual-developer',id from creator_types where code='organization'`;
      await admin`insert into entry_creators(entry_id,creator_id,role_id,is_manual) select 1,50,id,true from creator_roles where code='developer'`;
      await admin`insert into genres(id,slug,name) values(70,'manual-genre','Manual genre')`;
      await admin`insert into media_item_genres(media_item_id,genre_id,is_manual) values(1,70,true)`;
      const calls = requests;
      await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: { developers: ["Forged"] }, snapshotReferences: fetched.snapshotReferences, expectedSource: { provider: "rawg", externalId: "42" }, enqueueCompanyLogos: false });
      assert.equal(requests, calls);
      assert.deepEqual((await persisted())[0].facts, { custom: { keep: true }, gameSnapshotProcessed: true });
      assert.equal((await admin`select title from media_items where id=1`)[0].title, "Keep title");
      assert.deepEqual((await admin`select external_creator_id from creator_requests order by external_creator_id`).map(row => row.external_creator_id), ["developer:7", "publisher:7"]);
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='1' and purpose='primary'`)[0].n, 1);
      assert.equal((await admin`select count(*)::int n from entry_creators where creator_id=50 and is_manual`)[0].n, 1, "manual participation survives raw processing");
      assert.equal((await admin`select count(*)::int n from media_item_genres where genre_id=70 and is_manual`)[0].n, 1);
    });
    await t.test("platform approval and reopen use normalized raw evidence and preserve manual platforms", async () => {
      const platforms = await import("../src/db/queries/platform-requests");
      await admin`insert into platforms(id,slug,name) values(60,'manual-platform','Manual platform'),(61,'mapped-pc','Mapped PC')`;
      await admin`insert into media_item_platforms(media_item_id,platform_id,is_manual) values(1,60,true)`;
      const [request] = await admin`select id from platform_requests where external_platform_name='PC' and provider='rawg' and kind='mapping'`;
      const queued = await platforms.resolvePlatformRequest({ requestId: request.id, adminId: 1, decision: "map", platformIds: [61] });
      await platforms.applyPlatformRequest(request.id, { jobRunId: queued.jobRunId });
      await admin`update job_runs set status='succeeded' where id=${queued.jobRunId}`;
      assert.deepEqual((await admin`select platform_id from media_item_platforms where media_item_id=1 order by platform_id`).map(row => row.platform_id), [60, 61]);
      const [mapping] = await admin`select id from provider_platform_mappings where platform_id=61`;
      const reopened = await platforms.reopenPlatformMapping({ mappingId: mapping.id, adminId: 1 });
      await platforms.applyPlatformRequest(request.id, { jobRunId: reopened.jobRunId });
      await admin`update job_runs set status='succeeded' where id=${reopened.jobRunId}`;
      assert.deepEqual((await admin`select platform_id from media_item_platforms where media_item_id=1`).map(row => row.platform_id), [60]);
      assert.equal((await admin`select count(*)::int n from platform_request_media_items where request_id=${request.id} and media_item_id=1`)[0].n, 1, "reopen discovers the normalized record after platform facts have been removed");
      assert.equal((await admin`select decision from platform_requests where id=${request.id}`)[0].decision, null);
    });
    await t.test("partial responses cannot replace complete evidence; complete empty arrays can clear a roster", async () => {
      const before = await snapshots.getProviderSnapshot(describeGameSource("rawg", "42"));
      const complete = structuredClone(payload);
      delete payload.publishers;
      await assert.rejects(fetchRaw(), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
      assert.deepEqual((await snapshots.getProviderSnapshot(describeGameSource("rawg", "42")))?.payload, before?.payload);
      payload = complete;
      const [request] = await admin`select id from creator_requests where external_creator_id='developer:7'`;
      const decision = await resolveCreatorRequest({ requestId: request.id, decision: "exclude", adminId: 1 });
      await admin`update job_runs set status='succeeded' where id=${decision.jobRunId}`;
      const raw = await fetchRaw();
      await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: raw.snapshotReferences, enqueueCompanyLogos: false });
      assert.equal((await admin`select decision from creator_requests where id=${request.id}`)[0].decision, "exclude");
      assert.equal((await admin`select count(*)::int n from provider_creator_exclusions where external_creator_id='developer:7'`)[0].n, 1);
      assert.equal((await admin`select count(*)::int n from entry_creator_sources`)[0].n, 0);
      payload = { id: 42, name: "Empty", genres: [], platforms: [], developers: [], publishers: [] };
      const empty = await fetchRaw();
      await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: empty.snapshotReferences, enqueueCompanyLogos: false });
      assert.equal((await admin`select count(*)::int n from creator_request_media_items where media_item_id=1`)[0].n, 0);
      assert.deepEqual((await admin`select "references" from game_company_rosters where media_item_id=1`)[0].references, []);
      assert.equal((await admin`select count(*)::int n from entry_creators where creator_id=50 and is_manual`)[0].n, 1, "empty provider evidence cannot erase manual participation");
      assert.equal((await admin`select count(*)::int n from media_item_genres where genre_id=70 and is_manual`)[0].n, 1);
    });
    await t.test("stale evidence and changed sources fail without changing normalized state", async () => {
      const original = await fetchRaw();
      payload = { ...payload, name: "Changed raw" };
      const current = await fetchRaw();
      const before = await persisted();
      await assert.rejects(service.prepareGameSnapshotReferences("igdb", "42", current.snapshotReferences!), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
      await assert.rejects(service.prepareGameSnapshotReferences("rawg", "43", current.snapshotReferences!), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: original.snapshotReferences, enqueueCompanyLogos: false }), /PROVIDER_SNAPSHOT_CHANGED/);
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: current.snapshotReferences, expectedSource: { provider: "igdb", externalId: "42" }, enqueueCompanyLogos: false }), /PROVIDER_SOURCE_CHANGED/);
      assert.deepEqual(await persisted(), before);
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: { developers: ["Forged"] } }), /PROVIDER_SNAPSHOT_REQUIRED/);
      const [expired] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual','{}','expired',now()-interval '1 second',now(),now(),3,300,60,3600) returning id`;
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: current.snapshotReferences, jobGuard: { runId: expired.id, lockToken: "expired" }, enqueueCompanyLogos: false }), /STALE_SNAPSHOT_JOB/);
      assert.deepEqual(await persisted(), before);
    });
    await t.test("a raw payload changed without its hash cannot be applied as the old evidence", async () => {
      const raw = await fetchRaw();
      const before = await persisted();
      const [snapshot] = await admin`select id,payload from provider_snapshots where id=${raw.snapshotReferences![0].id}`;
      await admin`update provider_snapshots set payload=payload || '{"name":"Unhashed corruption"}'::jsonb where id=${snapshot.id}`;
      try {
        await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: raw.snapshotReferences, enqueueCompanyLogos: false }), /PROVIDER_SNAPSHOT_CHANGED/);
        assert.deepEqual(await persisted(), before);
      } finally {
        await admin`update provider_snapshots set payload=${admin.json(snapshot.payload)} where id=${snapshot.id}`;
      }
    });
    await t.test("failed relation writes roll back metadata, links and occurrences atomically", async () => {
      const raw = await fetchRaw();
      const before = await persisted();
      const links = await admin`select * from provider_snapshot_links order by snapshot_id,entity_type,entity_id,purpose`;
      const occurrences = await admin`select * from creator_request_media_items order by request_id,media_item_id`;
      await admin.unsafe(`create function ${schema}.fail_game_roster() returns trigger language plpgsql as $$ begin raise exception 'TEST_GAME_ROLLBACK'; end $$; create trigger fail_game_roster before insert or update on game_company_rosters for each row execute function ${schema}.fail_game_roster()`);
      await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "rawg", sourceExternalId: "42", facts: {}, snapshotReferences: raw.snapshotReferences, enqueueCompanyLogos: false }), error => error instanceof Error && error.cause instanceof Error && /TEST_GAME_ROLLBACK/.test(error.cause.message));
      assert.deepEqual(await persisted(), before);
      assert.deepEqual(await admin`select * from provider_snapshot_links order by snapshot_id,entity_type,entity_id,purpose`, links);
      assert.deepEqual(await admin`select * from creator_request_media_items order by request_id,media_item_id`, occurrences);
      await admin.unsafe("drop trigger fail_game_roster on game_company_rosters");
    });
    await t.test("legacy facts remain available only until complete evidence is applied", async () => {
      const legacy = { developers: ["Legacy only"] };
      assert.deepEqual(await service.getGameSnapshotFacts({ mediaItemId: 2, mediaType: "game", sourceProvider: "rawg", sourceExternalId: "99", facts: legacy }), legacy);
      assert.deepEqual(await service.getGameSnapshotFacts({ mediaItemId: 1, mediaType: "game", sourceProvider: "rawg", sourceExternalId: "42", facts: { gameSnapshotProcessed: true } }), { genres: [], platforms: [], gameCompanyReferences: [], developers: [], publishers: [] });
      await admin`delete from provider_snapshot_links where entity_type='media-item' and entity_id='1'`;
      await assert.rejects(service.getGameSnapshotFacts({ mediaItemId: 1, mediaType: "game", sourceProvider: "rawg", sourceExternalId: "42", facts: { gameSnapshotProcessed: true } }), /PROVIDER_SNAPSHOT_MISSING/);
    });
    await t.test("safe game transfer cleans duplicate facts without rewriting working state", async () => {
      const { transferGameSnapshot } = await import("../src/db/queries/game-snapshot-transfer");
      await admin`insert into media_items(id,code,title,media_type,publication_status) values(4,'safe-game-transfer','Safe transfer','game','published')`;
      await admin`insert into genres(id,slug,name) values(80,'safe-rpg','Safe RPG')`;
      await admin`insert into platforms(id,slug,name) values(81,'safe-console','Safe Console')`;
      await admin`insert into creators(id,name,slug,type_id) select 82,'Safe Studio','safe-studio',id from creator_types where code='organization'`;
      await admin`insert into provider_genre_mappings(provider,media_type,external_genre_id,external_genre_name,normalized_external_genre_name,genre_id) values('rawg','game','85','RPG','rpg',80)`;
      await admin`insert into provider_platform_mappings(provider,media_type,external_platform_name,normalized_external_platform_name,platform_id) values('rawg','game','Console','console',81)`;
      await admin`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id) values('rawg','developer:88','Safe Studio',82)`;
      let raw = { id: 242, name: "Safe raw", genres: [{ id: 85, name: "RPG" }], platforms: [{ platform: { id: 86, name: "Console" } }], developers: [{ id: 88, name: "Safe Studio" }], publishers: [] };
      const save = () => snapshots.saveProviderSnapshot({ ...describeGameSource("rawg", "242"), payload: raw, payloadHash: "ignored", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
      const snapshot = await save();
      const refs = [{ id: snapshot.id, payloadHash: snapshot.payloadHash }];
      await upsertMediaItemMetadata({ mediaItemId: 4, sourceProvider: "rawg", sourceExternalId: "242", facts: {}, snapshotReferences: refs, enqueueCompanyLogos: false });
      const projection = (await service.getSavedGameBundle("rawg", "242")).projection;
      const legacy = { ...projection.genreFacts, ...projection.platformFacts, gameCompanyReferences: projection.companyReferences, developers: ["Safe Studio"], publishers: [], custom: { preserved: [1, null, true] } };
      await admin`update media_item_metadata set facts=${admin.json(legacy)} where media_item_id=4`;
      await admin`delete from provider_snapshot_links where entity_type='media-item' and entity_id='4'`;
      const protectedState = async () => Promise.all([
        admin`select * from media_item_genres order by media_item_id,genre_id`,
        admin`select * from media_item_platforms order by media_item_id,platform_id`,
        admin`select * from entry_creators order by entry_id,creator_id,role_id`,
        admin`select * from entry_creator_sources order by entry_id,creator_id,role_id,provider`,
        admin`select * from game_company_rosters order by media_item_id,provider`,
        admin`select * from creator_requests order by id`,
        admin`select * from creator_request_media_items order by request_id,media_item_id,role_id`,
        admin`select * from genre_requests order by id`,
        admin`select * from genre_request_media_items order by request_id,media_item_id`,
        admin`select * from platform_requests order by id`,
        admin`select * from platform_request_media_items order by request_id,media_item_id`,
        admin`select * from job_runs order by id`,
      ]);
      const input = { mediaItemId: 4, provider: "rawg" as const, externalId: "242", refs, expectedSource: { provider: "rawg", externalId: "242" } };
      const before = await protectedState();
      await transferGameSnapshot(input);
      assert.deepEqual(await protectedState(), before, "transfer cannot modify relations, requests, rosters or jobs");
      assert.deepEqual((await admin`select facts from media_item_metadata where media_item_id=4`)[0].facts, { custom: legacy.custom, gameSnapshotProcessed: true });
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='4' and purpose='primary'`)[0].n, 1);
      const transferred = await admin`select * from media_item_metadata where media_item_id=4`;
      const { getSnapshotDifferences } = await import("../src/lib/providers/snapshot-diff");
      // Canonical labels may differ from provider names after moderation.
      await admin`update genres set name='Ролевая игра' where id=80`;
      await admin`update platforms set name='Компьютер' where id=81`;
      const comparison = await service.getGameMigrationComparison(4, (await service.getSavedGameBundle("rawg", "242")).projection);
      assert.deepEqual(comparison.blockers, []);
      assert.deepEqual(getSnapshotDifferences(comparison.preview.current, comparison.preview.proposed), []);

      await transferGameSnapshot(input);
      assert.deepEqual(await protectedState(), before);
      assert.deepEqual(await admin`select * from media_item_metadata where media_item_id=4`, transferred, "repeat transfer is a metadata no-op");

      for (const [key, value, code] of [
        ["genres", ["Different genre"], "genres-differ"],
        ["platforms", ["Different platform"], "platforms-differ"],
        ["developers", ["Different company"], "companies-differ"],
      ] as const) {
        await admin`update media_item_metadata set facts=${admin.json({ ...legacy, [key]: value, ...(key === "genres" ? { genreReferences: [] } : {}) })} where media_item_id=4`;
        const mismatchMetadata = await admin`select * from media_item_metadata where media_item_id=4`;
        await assert.rejects(transferGameSnapshot(input), error => error instanceof Error && error.message === "GAME_SNAPSHOT_DIFFERENCE" && "diagnostics" in error && Array.isArray(error.diagnostics) && error.diagnostics.includes(code));
        assert.deepEqual(await protectedState(), before);
        assert.deepEqual(await admin`select * from media_item_metadata where media_item_id=4`, mismatchMetadata);
      }
      await admin`update media_item_metadata set facts=${admin.json(transferred[0].facts)} where media_item_id=4`;
      await admin`delete from media_item_platforms where media_item_id=4 and platform_id=81`;
      const missingPlatform = await protectedState();
      await assert.rejects(transferGameSnapshot(input), error => error instanceof Error && "diagnostics" in error && Array.isArray(error.diagnostics) && error.diagnostics.includes("platform-links-differ"));
      assert.deepEqual(await protectedState(), missingPlatform, "safe transfer never repairs missing working assignments");
      await admin`insert into media_item_platforms(media_item_id,platform_id,provider) values(4,81,'rawg')`;
      // Restore the original relation timestamps before later bytewise comparisons.
      const originalPlatforms = before[1];
      const originalPlatform = originalPlatforms.find(row => row.media_item_id === 4 && row.platform_id === 81)!;
      await admin`update media_item_platforms set created_at=${originalPlatform.created_at},updated_at=${originalPlatform.updated_at} where media_item_id=4 and platform_id=81`;

      raw = { ...raw, developers: [{ id: 89, name: "Different Studio" }] };
      const changed = await save();
      const changedInput = { ...input, refs: [{ id: changed.id, payloadHash: changed.payloadHash }] };
      const links = await admin`select * from provider_snapshot_links where entity_type='media-item' and entity_id='4' order by snapshot_id,purpose`;
      await assert.rejects(transferGameSnapshot(changedInput), error => error instanceof Error && error.message === "GAME_SNAPSHOT_DIFFERENCE" && "diagnostics" in error && Array.isArray(error.diagnostics) && error.diagnostics.length > 0);
      assert.deepEqual(await protectedState(), before);
      assert.deepEqual(await admin`select * from media_item_metadata where media_item_id=4`, transferred);
      assert.deepEqual(await admin`select * from provider_snapshot_links where entity_type='media-item' and entity_id='4' order by snapshot_id,purpose`, links);
      await assert.rejects(transferGameSnapshot(input), /PROVIDER_SNAPSHOT_CHANGED/);
      await assert.rejects(transferGameSnapshot({ ...changedInput, expectedSource: { provider: "igdb", externalId: "242" } }), /PROVIDER_SOURCE_CHANGED/);
      const [expired] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual','{}','safe-expired',now()-interval '1 second',now(),now(),3,300,60,3600) returning id`;
      await assert.rejects(transferGameSnapshot({ ...changedInput, jobGuard: { runId: expired.id, lockToken: "safe-expired" } }), /STALE_SNAPSHOT_JOB/);
      assert.deepEqual(await admin`select * from media_item_metadata where media_item_id=4`, transferred);
    });
    await t.test("actual game snapshot jobs process offline, checkpoint success and verify without domain writes", async () => {
      const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
      await admin`insert into media_items(id,code,title,media_type,publication_status) values(3,'game-job','Game job','game','published')`;
      await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(3,'rawg','142','{}')`;
      let raw = { id: 142, name: "Job game", genres: [], platforms: [], developers: [] as { id: number; name: string }[], publishers: [] };
      const save = () => snapshots.saveProviderSnapshot({ ...describeGameSource("rawg", "142"), payload: raw, payloadHash: "ignored", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
      const job = async (operation: SnapshotJobPayload["operation"], applyGameChanges = false) => {
        const payload: SnapshotJobPayload = { operation, mediaType: "game", provider: "rawg", mediaItemIds: [3], ...(applyGameChanges ? { applyGameChanges: true } : {}) };
        const [run] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual',${admin.json(payload)},'game-job-lease',now()+interval '10 minutes',now(),now(),3,300,60,3600) returning id`;
        return { id: Number(run.id), payload };
      };
      const execute = (run: { id: number; payload: SnapshotJobPayload }) => providerSnapshotJobHandler.execute({ runId: run.id, payload: run.payload, lockToken: "game-job-lease", source: "manual", attempt: 1, jobId: null, signal: new AbortController().signal });
      const checkpoint = async (id: number) => (await admin`select payload from job_runs where id=${id}`)[0].payload.checkpoint;
      const domainState = async () => Promise.all([
        admin`select * from media_items where id=3`,
        admin`select * from media_item_metadata where media_item_id=3`,
        admin`select * from provider_snapshot_links where entity_type='media-item' and entity_id='3' order by snapshot_id,purpose`,
        admin`select * from creator_request_media_items where media_item_id=3 order by request_id,role_id`,
        admin`select * from game_company_rosters where media_item_id=3 order by provider`,
        admin`select * from media_item_genres where media_item_id=3 order by genre_id`,
        admin`select * from media_item_platforms where media_item_id=3 order by platform_id`,
      ]);
      await save();
      const originalFetch = globalThis.fetch;
      let networkRequests = 0;
      const previousRequests = requests;
      globalThis.fetch = async () => { networkRequests++; throw new Error("UNEXPECTED_NETWORK_IN_OFFLINE_GAME_JOB"); };
      try {
        const process = await job("process");
        await execute(process);
        assert.equal((await checkpoint(process.id)).processed, 1);
        assert.equal((await checkpoint(process.id)).failed, 0);
        assert.deepEqual((await admin`select facts from media_item_metadata where media_item_id=3`)[0].facts, { gameSnapshotProcessed: true });
        const before = await domainState();
        const verify = await job("verify");
        await execute(verify);
        assert.equal((await checkpoint(verify.id)).processed, 1);
        assert.deepEqual(await domainState(), before);

        raw = { ...raw, developers: [{ id: 99, name: "Changed raw developer" }] };
        await save();
        const changed = await job("verify");
        await assert.rejects(execute(changed), error => error instanceof JobError && error.code === "snapshot-items-failed");
        assert.equal((await checkpoint(changed.id)).failed, 1);
        assert.equal((await checkpoint(changed.id)).errors[0].code, "migration-difference");
        assert.deepEqual(await domainState(), before, "verification reports changed raw without applying it");

        const safeProcess = await job("process");
        await assert.rejects(execute(safeProcess), error => error instanceof JobError && error.code === "snapshot-items-failed");
        const safeCheckpoint = await checkpoint(safeProcess.id);
        assert.equal(safeCheckpoint.processed, 0);
        assert.equal(safeCheckpoint.failed, 1);
        assert.equal(safeCheckpoint.errors[0].code, "game-snapshot-difference");
        assert.ok(safeCheckpoint.diagnostics.some((row: { id: number; codes: string[] }) => row.id === 3 && row.codes.includes("companies-differ")));
        assert.deepEqual(await domainState(), before, "default process reports a difference without applying new company participation");

        const logoJobs = (await admin`select count(*)::int n from job_runs where type='media.game-company-enrich'`)[0].n;
        const applyChanged = await job("process", true);
        await execute(applyChanged);
        assert.equal((await checkpoint(applyChanged.id)).processed, 1);
        assert.equal((await admin`select count(*)::int n from job_runs where type='media.game-company-enrich'`)[0].n, logoJobs, "offline processing must not enqueue company HTTP enrichment");
        assert.equal((await admin`select count(*)::int n from creator_request_media_items o join creator_requests r on r.id=o.request_id where o.media_item_id=3 and r.external_creator_id='developer:99'`)[0].n, 1);
        assert.equal(networkRequests, 0);
        assert.equal(requests, previousRequests);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  } finally {
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(), admin.end()]);
  }
});
