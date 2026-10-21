import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

test("media missing-raw selector uses exact primary descriptors and interrupted network jobs resume saved raw", {
  skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1",
}, async () => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const original = process.env.DATABASE_URL!;
  const admin = postgres(original, { max: 1, prepare: false });
  const schema = `media_missing_${process.pid}_${Date.now()}`;
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(original);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  const require = createRequire(import.meta.url);
  const servicePath = require.resolve("../src/lib/providers/tmdb-film-service");
  const originalFetch = globalThis.fetch;
  let originalService: unknown;
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
    await client.unsafe('insert into media_types select * from public.media_types');
    const { describeBookSource } = await import("../src/lib/providers/book-adapters");
    const { describeTmdbFilmSource } = await import("../src/lib/providers/tmdb-film-adapter");
    const { saveProviderSnapshot } = await import("../src/db/queries/provider-snapshots");
    const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
    const { providerSnapshotBookBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
    for (const [index, provider] of (["fantlab", "google-books", "open-library", "tmdb"] as const).entries()) {
      const offset = index * 10;
      const externalId = provider === "open-library" ? "/works/OL42W" : "42";
      const mediaType = provider === "tmdb" ? "film" : "book";
      for (const id of [offset + 1, offset + 2]) {
        await client`insert into media_items(id,code,title,media_type,publication_status) values(${id},${'test-'+id},'Existing fields',${mediaType},'published')`;
        await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts,fetched_at) values(${id},${provider},${externalId},'{"unrelated":"filled"}',now())`;
      }
      const descriptor = provider === "tmdb" ? describeTmdbFilmSource(externalId) : describeBookSource(provider, externalId);
      const save = (overrides: Partial<typeof descriptor>) => saveProviderSnapshot({ ...descriptor, ...overrides, payload: { saved: true }, payloadHash: snapshotHash({ saved: true }), contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
      await save({ resourceType: "other-resource" });
      await save({ apiMethod: "other-method" });
      await save({ requestParams: { ...descriptor.requestParams, other: true } });
      if (provider === "open-library") await save({ resourceType: "author", externalId: "/authors/OL42A", apiMethod: "authors.get", requestParams: {} });
      const query = (retryId?: number) => providerSnapshotBookBatchQuery({ afterId: offset, throughId: offset + 2, provider, onlyMissingSnapshots: true, retryId, batchSize: 10 });
      assert.deepEqual((await query()).map(row => row.id), [offset + 1, offset + 2], `${provider}: unrelated descriptors do not count`);
      await save({});
      assert.deepEqual(await query(), [], `${provider}: unlinked primary raw covers all records sharing the source`);
      assert.deepEqual((await query(offset + 1)).map(row => row.id), [offset + 1], `${provider}: pinned retry remains eligible after raw save`);
      assert.equal((await providerSnapshotBookBatchQuery({ afterId: offset, throughId: offset + 2, provider, batchSize: 10 })).length, 2, "historical unfiltered selection remains unchanged");
    }
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) values(100,'interrupted-film','Manual film','film','published');
      insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(100,'tmdb','100','{}');
      insert into provider_settings(media_type,provider_code,enabled) values('film','tmdb',true);
      insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(99,'provider.snapshots','manual','running','active',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    const service = await import("../src/lib/providers/tmdb-film-service");
    originalService = require.cache[servicePath]!.exports;
    const raw = { id: 100, runtime: 123, original_language: "en", genres: [], production_companies: [], production_countries: [], credits: { cast: [], crew: [] } };
    let requests = 0;
    globalThis.fetch = async () => { requests++; return Response.json(raw); };
    let interrupt = true;
    const abort = new AbortController();
    require.cache[servicePath]!.exports = { ...service, fetchTmdbFilmMetadata: async (...args: Parameters<typeof service.fetchTmdbFilmMetadata>) => {
      const [input, options] = args;
      assert.equal(options.snapshotReuseAfter?.getTime(), 0, "missing-only resumes any saved primary without re-fetching");
      const metadata = await service.fetchTmdbFilmMetadata(input, { ...options, providerCredentials: { tmdb: { accessToken: "test" } }, beforeProviderSearch: async () => true });
      if (interrupt) { interrupt = false; abort.abort(new Error("SIMULATED_INTERRUPTION_AFTER_RAW")); throw abort.signal.reason; }
      return metadata;
    } };
    const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
    const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
    const context = { runId: 99, lockToken: "active", jobId: null, attempt: 1, source: "manual" as const };
    await assert.rejects(providerSnapshotJobHandler.execute({ ...context, signal: abort.signal, payload: parseSnapshotJobPayload({ operation: "refresh-process", provider: "tmdb", onlyMissingSnapshots: true, afterId: 99, throughId: 100 }) }), /SIMULATED_INTERRUPTION_AFTER_RAW/);
    const [run] = await client`select payload from job_runs where id=99`;
    assert.equal(run.payload.checkpoint.retryId, 100, "target is pinned before network/raw commit");
    assert.equal(run.payload.checkpoint.afterId, 99);
    await providerSnapshotJobHandler.execute({ ...context, signal: new AbortController().signal, payload: parseSnapshotJobPayload(run.payload) });
    const [finished] = await client`select payload from job_runs where id=99`;
    assert.equal(finished.payload.checkpoint.afterId, 100);
    assert.equal(finished.payload.checkpoint.processed, 1);
    assert.equal((await client`select facts from media_item_metadata where media_item_id=100`)[0].facts.runtimeMinutes, 123);
    assert.equal(requests, 1, "saved raw is applied after resume without a second network call");
  } finally {
    if (originalService) require.cache[servicePath]!.exports = originalService;
    globalThis.fetch = originalFetch;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
