import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import type { SnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";
import { JobError } from "../src/lib/jobs/types";

const testUrl = process.env.ANILIST_METADATA_TEST_DATABASE_URL;
const redisUrl = process.env.ANILIST_BACKFILL_TEST_REDIS_URL;
test("anime participates in the shared snapshot workflow with guarded raw/process/verify batches", { skip: !testUrl || !redisUrl }, async t => {
  const schema = `anilist_snapshot_job_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = redisUrl;
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const { dbClient } = await import("../src/db");
  const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
  const originalFetch = globalThis.fetch;
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
    await admin`insert into provider_settings(media_type,provider_code,enabled,title_search_mode,cover_search_enabled,priority) values('anime','anilist',true,'parallel',true,1)`;
    await admin`insert into media_items(id,code,title,description,media_type,publication_status) values(1,'snapshot-ani','Anime','Keep anime description','anime','published'),(2,'snapshot-jikan','Jikan','Keep Jikan description','anime','published')`;
    await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'anilist','101','{"keep":1,"studios":["Old"]}'),(2,'jikan','202','{"keep":2}')`;
    let requests = 0;
    let malformed = false;
    let sourceChange = false;
    let pagination = false;
    let limited = false;
    const requestedPages: number[] = [];
    globalThis.fetch = async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      const page = Number(body.variables.page);
      if (pagination) {
        requestedPages.push(page);
        if (page === 2 && limited) return new Response(null, { status: 429, headers: { "retry-after": "54" } });
      }
      const byMal = body.query.includes("idMal:$id");
      const mediaId = byMal ? 102 : Number(body.variables.id);
      if (sourceChange) await admin`update media_item_metadata set source_external_id='999' where media_item_id=1`;
      if (malformed) return Response.json({ errors: [{ message: "partial" }], data: { Media: null } });
      return Response.json({ data: { Media: { id: mediaId, idMal: byMal ? 202 : 201,
        staff: { pageInfo: { currentPage: page, hasNextPage: pagination && page === 1 }, edges: [{ role: "Director", node: { id: mediaId + page - 1, name: { full: `Director ${mediaId + page - 1}` } } }] },
        studios: { pageInfo: { hasNextPage: false }, nodes: [{ id: mediaId, name: `Studio ${mediaId}`, isAnimationStudio: true }] },
      } } });
    };
    const job = async (operation: SnapshotJobPayload["operation"], extra: Partial<SnapshotJobPayload> = {}) => {
      const payload = { mediaType: "anime", provider: "anilist", operation, ...extra } as SnapshotJobPayload;
      const [row] = await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('provider.snapshots','running','manual',${admin.json(payload)},'lease',now()+interval '10 minutes',now(),now(),3,300,60,3600) returning id`;
      return { id: Number(row.id), payload };
    };
    const execute = (run: { id: number; payload: SnapshotJobPayload }) => providerSnapshotJobHandler.execute({ runId: run.id, payload: run.payload, lockToken: "lease", source: "manual", attempt: 1, jobId: null, signal: new AbortController().signal });
    const resume = async (runId: number) => ({ id: runId, payload: (await admin`select payload from job_runs where id=${runId}`)[0].payload as SnapshotJobPayload });
    const facts = async (id: number) => (await admin`select facts from media_item_metadata where media_item_id=${id}`)[0].facts;

    await t.test("refresh persists and attaches both primary and supplemental raw without applying participants", async () => {
      await execute(await job("refresh"));
      assert.equal(requests, 2);
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where purpose='dependency'`)[0].n, 2);
      assert.equal((await admin`select count(*)::int n from creator_request_media_items`)[0].n, 0);
      assert.deepEqual(await facts(1), { keep: 1, studios: ["Old"] });
      assert.deepEqual(await facts(2), { keep: 2 });
      const verify = await job("verify");
      await assert.rejects(execute(verify), error => error instanceof JobError && error.code === "snapshot-items-failed");
      assert.equal((await resume(verify.id)).payload.checkpoint?.errors[0].code, "migration-difference");
      assert.equal((await admin`select count(*)::int n from creator_request_media_items`)[0].n, 0);
    });
    await t.test("process and verify run offline; only process updates the roster and keeps primary fields", async () => {
      const calls = requests;
      await execute(await job("process"));
      assert.equal(requests, calls);
      assert.equal((await admin`select count(*)::int n from creator_request_media_items`)[0].n, 4);
      assert.deepEqual(await facts(2), { keep: 2, anilistCreatorsComplete: true });
      assert.equal((await admin`select source_provider from media_item_metadata where media_item_id=2`)[0].source_provider, "jikan");
      assert.equal((await admin`select description from media_items where id=2`)[0].description, "Keep Jikan description");
      const before = await admin`select * from media_item_metadata order by media_item_id`;
      await execute(await job("verify"));
      assert.equal(requests, calls);
      assert.deepEqual(await admin`select * from media_item_metadata order by media_item_id`, before);
    });
    await t.test("batch continuation preserves its range and pause; only-missing accepts unattached complete raw", async () => {
      const run = await job("refresh-process", { batchSize: 1, batchPauseHours: 0.5 });
      await assert.rejects(execute(run), error => error instanceof JobError && error.code === "provider-continue" && error.deferSeconds === 1800);
      const continued = await resume(run.id);
      assert.equal(continued.payload.checkpoint?.afterId, 1);
      await execute(continued);
      assert.equal((await resume(run.id)).payload.checkpoint?.processed, 2);
      await admin`delete from provider_snapshot_links`;
      const calls = requests;
      const missing = await job("refresh", { onlyMissingSnapshots: true });
      await execute(missing);
      assert.equal(requests, calls);
      assert.equal((await resume(missing.id)).payload.checkpoint?.processed, 0);
    });
    await t.test("partial raw and a source changed during HTTP cannot replace working participants", async () => {
      const before = await admin`select * from creator_request_media_items order by request_id,media_item_id`;
      malformed = true;
      const partial = await job("refresh-process", { mediaItemIds: [1] });
      await assert.rejects(execute(partial), error => error instanceof JobError && error.code === "provider-retry");
      assert.deepEqual(await admin`select * from creator_request_media_items order by request_id,media_item_id`, before);
      malformed = false;
      sourceChange = true;
      await assert.rejects(execute(await job("refresh-process", { mediaItemIds: [1] })), error => error instanceof JobError && error.code === "snapshot-items-failed");
      assert.deepEqual(await admin`select * from creator_request_media_items order by request_id,media_item_id`, before);
    });
    await t.test("429 on page two survives a new worker lease and resumes without fetching page one", async () => {
      sourceChange = false;
      await admin`update media_item_metadata set source_external_id='101' where media_item_id=1`;
      pagination = true; limited = true;
      const run = await job("refresh", { mediaItemIds: [1] });
      await assert.rejects(execute(run), error => error instanceof JobError && error.code === "provider-deferred" && /HTTP 429.*Запись №1/.test(error.message));
      const { getRedisClient } = await import("../src/lib/services/redis");
      const redis = (await getRedisClient())!;
      const key = `anilist:creators:pages:v1:${run.id}:media:101`;
      const originalStartedAt = await redis.hGet(key, "startedAt");
      assert.ok(await redis.hGet(key, "1"));
      assert.equal(await redis.hGet(key, "2"), null);
      assert.deepEqual(requestedPages, [1, 2]);
      // Simulate expiry of AniList's shared cooldown, then a new claim of the same run.
      await redis.del(["anilist:api:cooldown:v1", "anilist:api:request-slot:v1"]);
      await admin`update job_runs set lock_token='resumed-lease' where id=${run.id}`;
      limited = false;
      const resumed = await resume(run.id);
      await providerSnapshotJobHandler.execute({ runId: run.id, payload: resumed.payload, lockToken: "resumed-lease", source: "manual", attempt: 1, jobId: null, signal: new AbortController().signal });
      assert.deepEqual(requestedPages, [1, 2, 2]);
      assert.equal((await resume(run.id)).payload.checkpoint?.processed, 1);
      const [snapshot] = await admin`select payload,request_started_at from provider_snapshots where provider_code='anilist' and external_id='101' and api_method='anime.creators'`;
      assert.equal(snapshot.payload.responses.length, 2);
      assert.equal(new Date(snapshot.request_started_at).getTime(), new Date(originalStartedAt!).getTime());
      assert.equal(await redis.exists(key), 0);
      pagination = false;
    });
  } finally {
    globalThis.fetch = originalFetch;
    const { closeRedisClient } = await import("../src/lib/services/redis");
    await closeRedisClient();
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(), admin.end()]);
  }
});
