import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";

// Each test uses copied tables and isolated sequences; provider HTTP is mocked.
test("TV service persists full raw, reuses exact descriptor, validates refs and keeps film TV IDs separate", {
  skip: !process.env.TMDB_SERIES_TEST_DATABASE_URL,
}, async () => {
  const original = process.env.DATABASE_URL;
  const originalFetch = globalThis.fetch;
  const connection = process.env.TMDB_SERIES_TEST_DATABASE_URL!;
  const admin = postgres(connection, { max: 1, prepare: false, onnotice: () => undefined });
  const schema = `tmdb_series_service_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(connection);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    const tables = await admin`select tablename from pg_tables where schemaname='public' and tablename in ('provider_snapshots','provider_snapshot_links','media_items','media_item_metadata','job_runs')`;
    for (const { tablename } of tables) await client.unsafe(`create table "${tablename}" (like public."${tablename}" including defaults including constraints including indexes)`);
    const serials = await client`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for (const [index, column] of serials.entries()) {
      await client.unsafe(`create sequence ${schema}.test_serial_${index} start 1000000`);
      await client.unsafe(`alter table "${column.table_name}" alter column "${column.column_name}" set default nextval('${schema}.test_serial_${index}')`);
    }
    const raw = { id: 42, name: "Сериал", original_name: "Series", overview: "Описание", first_air_date: "2000-01-01", last_air_date: "2002-01-01",
      number_of_seasons: 0, number_of_episodes: 0, episode_run_time: [], seasons: [], genres: [], production_companies: [], networks: [], created_by: [], aggregate_credits: { cast: [], crew: [] }, future: { unknown: true } };
    const service = await import("../src/lib/providers/tmdb-series-service");
    const { getTitleMetadata } = await import("../src/lib/covers/registry");
    const options = { enrichTitleFields: true, candidateLimit: 1, tmdbResultScanLimit: 1, providerCredentials: { tmdb: { accessToken: "test-token" } } };
    let calls = 0;
    let reservations = 0;
    globalThis.fetch = async input => {
      calls++;
      const request = new URL(String(input));
      assert.equal(request.pathname, "/3/tv/42");
      assert.equal(request.searchParams.get("append_to_response"), "aggregate_credits");
      assert.equal(request.searchParams.get("language"), "ru-RU");
      return Response.json(raw);
    };
    const result = await getTitleMetadata({ provider: "tmdb", externalId: "42", mediaType: "series" }, undefined, { ...options, beforeProviderSearch: async () => { reservations++; return true; } });
    assert.equal(result.error, null);
    assert.equal(result.metadata?.fields?.title, "Сериал");
    assert.deepEqual(result.metadata?.parts, []);
    assert.equal(calls, 1);
    assert.equal(reservations, 1);
    const refs = result.metadata!.snapshotReferences!;
    const saved = await service.prepareTmdbSeriesSnapshotReferences("42", refs);
    assert.deepEqual(saved.primary.payload, raw);
    await assert.rejects(() => service.prepareTmdbSeriesSnapshotReferences("42", [{ ...refs[0], payloadHash: "0".repeat(64) }]), /PROVIDER_SNAPSHOT_CHANGED/);
    const { getSavedTmdbFilmBundle } = await import("../src/lib/providers/tmdb-film-service");
    await assert.rejects(() => getSavedTmdbFilmBundle("42"), /PROVIDER_SNAPSHOT_MISSING/);
    await service.fetchTmdbSeriesMetadata({ provider: "tmdb", externalId: "42", mediaType: "series" }, { ...options, snapshotReuseAfter: new Date(0) });
    assert.equal(calls, 1);
    await client.unsafe(`insert into media_items(id,code,title,media_type,publication_status) values
      (1,'series-one','Series one','series','published'),(2,'film-two','Film two','film','published'),(3,'series-three','Series three','series','published');
      insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(1,'tmdb','42','{}'),(2,'tmdb','42','{}'),(3,'tmdb','42','{}');
      insert into job_runs(id,type,source,status,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds)
      values(99,'provider.snapshots','manual','running','batch-token',now()+interval '1 hour',now(),now(),3,300,60,3600)`);
    const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
    const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
    const { providerSnapshotBookBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
    assert.deepEqual((await providerSnapshotBookBatchQuery({mediaType:"series",provider:"tmdb",afterId:0,throughId:3})).map(row=>row.id),[1,3]);
    assert.deepEqual((await providerSnapshotBookBatchQuery({provider:"tmdb",afterId:0,throughId:3})).map(row=>row.id),[2]);
    const context = { runId:99,lockToken:"batch-token",jobId:null,attempt:1,source:"manual" as const,signal:new AbortController().signal };
    await assert.rejects(() => providerSnapshotJobHandler.execute({...context,payload:parseSnapshotJobPayload({operation:"verify",provider:"tmdb",mediaType:"series",batchSize:1,afterId:0,throughId:3})}),error=>Boolean(error && typeof error === "object" && "code" in error && error.code === "provider-continue"));
    const [checkpoint] = await client`select payload from job_runs where id=99`;
    assert.equal(checkpoint.payload.checkpoint.afterId,1);
    assert.equal(checkpoint.payload.checkpoint.processed,1);
    await providerSnapshotJobHandler.execute({...context,payload:parseSnapshotJobPayload(checkpoint.payload)});
    assert.equal((await client`select payload from job_runs where id=99`)[0].payload.checkpoint.processed,2);
    assert.deepEqual((await client`select facts from media_item_metadata order by media_item_id`).map(row=>row.facts),[{},{},{}]);
    await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=99`;
    await assert.rejects(() => providerSnapshotJobHandler.execute({...context,payload:parseSnapshotJobPayload({operation:"verify",provider:"tmdb",mediaType:"series"})}),/STALE_SNAPSHOT_JOB/);

    globalThis.fetch = async () => new Response("", { status: 429, headers: { "retry-after": "13" } });
    await assert.rejects(() => service.fetchTmdbSeriesMetadata({ provider: "tmdb", externalId: "43", mediaType: "series" }, options), error => Boolean(error && typeof error === "object" && "retryAfterSeconds" in error && error.retryAfterSeconds === 13));
    globalThis.fetch = async () => Response.json({ id: 43, networks: null });
    await assert.rejects(() => service.fetchTmdbSeriesMetadata({ provider: "tmdb", externalId: "43", mediaType: "series" }, options), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
    assert.equal((await client`select count(*)::int n from provider_snapshots`)[0].n, 1);
    const { prepareTmdbFilmSnapshotReferences } = await import("../src/lib/providers/tmdb-film-service");
    await assert.rejects(() => prepareTmdbFilmSnapshotReferences("42", refs), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
  } finally {
    globalThis.fetch = originalFetch;
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
