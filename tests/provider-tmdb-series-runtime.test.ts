import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

const testUrl = process.env.TMDB_SERIES_TEST_DATABASE_URL;
test("TV snapshot import preserves identities, roles, manual data, seasons and atomic guards", { skip: !testUrl }, async () => {
  const schema = `tmdb_series_import_${process.pid}_${Date.now()}`;
  const scoped = new URL(testUrl!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "1";
  const admin = postgres(testUrl!, { max: 1 });
  const { dbClient, getDbClient } = await import("../src/db");
  const client = getDbClient();
  const originalFetch = globalThis.fetch;
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const service = await import("../src/lib/providers/tmdb-series-service");
  const adapter = await import("../src/lib/providers/tmdb-series-adapter");
  const { describeTmdbFilmSource } = await import("../src/lib/providers/tmdb-film-adapter");
  const snapshots = await import("../src/db/queries/provider-snapshots");
  const metadata = await import("../src/db/queries/media-item-metadata");
  const requests = await import("../src/db/queries/creator-requests");
  try {
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const tables = await admin`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    for (const { tablename } of tables) await client.unsafe(`CREATE UNLOGGED TABLE ${quote(tablename)} (LIKE public.${quote(tablename)} INCLUDING ALL)`);
    const serials = await client`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=${schema} AND column_default LIKE 'nextval(%'`;
    for (const [index, row] of serials.entries()) {
      await client.unsafe(`CREATE SEQUENCE ${schema}.serial_${index} START 1000000`);
      await client.unsafe(`ALTER TABLE ${quote(row.table_name)} ALTER COLUMN ${quote(row.column_name)} SET DEFAULT nextval('${schema}.serial_${index}')`);
    }
    for (const table of ["media_types", "creator_types", "creator_roles"]) await client.unsafe(`INSERT INTO ${quote(table)} SELECT * FROM public.${quote(table)}`);
    await client.unsafe(`INSERT INTO media_items(id,code,title,media_type,publication_status) VALUES
      (1,'film-42','Film','film','published'),(2,'series-42','Ручное название','series','published'),(3,'anime-42','Anime','anime','published');
      INSERT INTO creators(id,name,name_ru,name_ru_source,name_ru_processed,slug,type_id)
        SELECT 100,'Netflix',null,null,false,'netflix',id FROM creator_types WHERE code='organization';
      INSERT INTO creators(id,name,name_ru,name_ru_source,name_ru_processed,slug,type_id)
        SELECT 101,'John Creator','Ручное имя','manual',true,'john',id FROM creator_types WHERE code='person';
      INSERT INTO creators(id,name,slug,type_id) SELECT 102,'Manual person','manual-person',id FROM creator_types WHERE code='person';
      INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) VALUES
        ('tmdb','company:42',100,'Netflix'),('tmdb','person:42',101,'John Creator');
      INSERT INTO entry_creators(entry_id,creator_id,role_id,is_manual) SELECT 1,100,id,false FROM creator_roles WHERE code='production_company';
      INSERT INTO entry_creators(entry_id,creator_id,role_id,is_manual) SELECT 2,102,id,true FROM creator_roles WHERE code='creator';
      INSERT INTO title_parts(media_item_id,type,number,name,source_provider,external_id,sort_order) VALUES(2,'season',1,'Ручной сезон',null,null,1);
      INSERT INTO media_item_metadata(media_item_id,source_provider,source_external_id,facts) VALUES(2,'tmdb','42','{"networks":["Old network"],"legacyField":"keep"}');`);
    const raw = {
      id: 42, name: "API title", original_name: "Series", overview: "Описание", first_air_date: "2001-01-01", last_air_date: null,
      number_of_seasons: 2, number_of_episodes: 20, episode_run_time: [40], genres: [],
      production_companies: [{ id: 42, name: "Netflix", logo_path: null }], networks: [{ id: 42, name: "Netflix", logo_path: null }],
      created_by: [{ id: 42, name: "John Creator" }], aggregate_credits: { cast: [], crew: [
        { id: 42, name: "John Creator", jobs: [{ job: "Showrunner" }] },
        { id: 43, name: "Only producer", jobs: [{ job: "Executive Producer" }] },
      ] }, seasons: [{ id: 4202, season_number: 2, name: "Сезон 2", air_date: "2002-01-01", episode_count: 10, poster_path: null }], future: { preserve: true },
    };
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/3/tv/42");
      assert.equal(url.searchParams.get("append_to_response"), "aggregate_credits");
      assert.equal(url.searchParams.get("language"), "ru-RU");
      return new Response(JSON.stringify(raw), { headers: { "content-type": "application/json" } });
    };
    const fetched = await service.fetchTmdbSeriesMetadata({ provider: "tmdb", mediaType: "series", externalId: "42" }, { candidateLimit: 1, providerCredentials: { tmdb: { accessToken: "test" } } });
    assert.equal(calls, 1);
    const movie = await snapshots.saveProviderSnapshot({ ...describeTmdbFilmSource("42"), payload: { id: 42 }, payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
    assert.notEqual(movie.id, fetched.snapshotReferences![0].id);
    await assert.rejects(() => service.prepareTmdbSeriesSnapshotReferences("42", [{ id: movie.id, payloadHash: movie.payloadHash }]), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: { networks: ["Untrusted"] }, snapshotReferences: fetched.snapshotReferences, enqueueCompanyLogos: false });
    const [stored] = await client`SELECT facts FROM media_item_metadata WHERE media_item_id=2`;
    assert.equal(Object.hasOwn(stored.facts, "networks"), false);
    assert.equal(stored.facts.legacyField, "keep");
    assert.equal((await client`SELECT title FROM media_items WHERE id=2`)[0].title, "Ручное название");
    assert.equal((await client`SELECT name FROM title_parts WHERE media_item_id=2 AND number=1`)[0].name, "Ручной сезон");
    assert.equal((await client`SELECT count(*)::int count FROM title_parts WHERE media_item_id=2`)[0].count, 2);
    await requests.autoApproveTmdbCompanyRequests({ externalIds: ["company:42", "network:42"] });
    await requests.autoApproveTmdbDirectorRequests({ externalIds: ["person:42"] });
    for (const row of await client`SELECT id FROM creator_requests WHERE decision IS NOT NULL`) await requests.applyCreatorRequest(row.id);
    assert.equal((await client`SELECT creator_id FROM provider_creator_bindings WHERE provider='tmdb' AND external_creator_id='network:42' AND active`)[0].creator_id, 100);
    assert.equal((await client`SELECT count(*)::int count FROM creators WHERE name='Netflix'`)[0].count, 1);
    const personRoles = await client`SELECT r.code FROM entry_creators e JOIN creator_roles r ON r.id=e.role_id WHERE e.entry_id=2 AND e.creator_id=101 ORDER BY r.code`;
    assert.deepEqual(personRoles.map(row => row.code), ["creator", "showrunner"]);
    assert.equal((await client`SELECT name_ru FROM creators WHERE id=101`)[0].name_ru, "Ручное имя");
    assert.equal((await client`SELECT count(*)::int count FROM creator_requests WHERE external_creator_id='person:43'`)[0].count, 0);
    const before = (await client`SELECT count(*)::int count FROM entry_creators WHERE entry_id=2`)[0].count;
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, enqueueCompanyLogos: false });
    assert.equal((await client`SELECT count(*)::int count FROM entry_creators WHERE entry_id=2`)[0].count, before);
    await assert.rejects(() => metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, expectedSource: { provider: "tmdb", externalId: "stale" } }), /PROVIDER_SOURCE_CHANGED/);
    await assert.rejects(() => metadata.upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences }), /INVALID_PROVIDER_SNAPSHOT_TARGET/);
    await assert.rejects(() => metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, jobGuard: { runId: 9999, lockToken: "lost" } }), /lease|Запуск|STALE/i);
    const [beforeFailure] = await client`SELECT source_url FROM media_item_metadata WHERE media_item_id=2`;
    await client`UPDATE creator_roles SET code='showrunner_hidden' WHERE code='showrunner'`;
    try {
      await assert.rejects(() => metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", sourceUrl: "must-roll-back", facts: {}, snapshotReferences: fetched.snapshotReferences }), /Роли TMDB|showrunner/);
    } finally { await client`UPDATE creator_roles SET code='showrunner' WHERE code='showrunner_hidden'`; }
    assert.equal((await client`SELECT source_url FROM media_item_metadata WHERE media_item_id=2`)[0].source_url, beforeFailure.source_url);
    await client.unsafe(`INSERT INTO job_runs(id,type,payload,source,status,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds,lock_token,lock_expires_at)
      VALUES(900001,'provider.snapshots','{}','manual','running',now(),now(),3,300,60,3600,'test-lease',now()+interval '5 minutes')`);
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, jobGuard: { runId: 900001, lockToken: "test-lease" }, checkpoint: { committed: true }, enqueueCompanyLogos: false });
    assert.equal((await client`SELECT payload FROM job_runs WHERE id=900001`)[0].payload.committed, true);
    await client`UPDATE job_runs SET lock_expires_at=now()-interval '1 second' WHERE id=900001`;
    await assert.rejects(() => metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, jobGuard: { runId: 900001, lockToken: "test-lease" }, checkpoint: { committed: false } }), /lease|Запуск|STALE/i);
    assert.equal((await client`SELECT payload FROM job_runs WHERE id=900001`)[0].payload.committed, true);
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: null, sourceExternalId: null, facts: {} });
    assert.deepEqual((await client`SELECT creator_id,is_manual FROM entry_creators WHERE entry_id=2`).map(row => [row.creator_id,row.is_manual]), [[102,true]]);
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: fetched.snapshotReferences, enqueueCompanyLogos: false });
    assert.equal((await client`SELECT count(*)::int count FROM entry_creators WHERE entry_id=2`)[0].count, before);
    const empty = structuredClone(raw);
    empty.production_companies = []; empty.networks = []; empty.created_by = []; empty.aggregate_credits.crew = [];
    const emptySnapshot = await snapshots.saveProviderSnapshot({ ...adapter.describeTmdbSeriesSource("42"), payload: empty, payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() });
    await metadata.upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "tmdb", sourceExternalId: "42", facts: {}, snapshotReferences: [{ id: emptySnapshot.id, payloadHash: emptySnapshot.payloadHash }], enqueueCompanyLogos: false });
    assert.deepEqual((await client`SELECT creator_id,is_manual FROM entry_creators WHERE entry_id=2`).map(row => [row.creator_id, row.is_manual]), [[102, true]]);
    assert.equal((await client`SELECT count(*)::int count FROM entry_creators WHERE entry_id=1`)[0].count, 1);
    await assert.rejects(() => service.prepareTmdbSeriesSnapshotReferences("42", fetched.snapshotReferences!), /PROVIDER_SNAPSHOT_CHANGED/);
    await metadata.deleteMediaItemMetadata(2);
    assert.equal((await client`SELECT count(*)::int count FROM entry_creators WHERE entry_id=2 AND is_manual`)[0].count, 1);
    // DDL is also exercised by the full migration run; retain a source-level guard for role scope.
    assert.match(readFileSync("drizzle/0143_tmdb_series_creators.sql", "utf8"), /network\|person/);
  } finally {
    globalThis.fetch = originalFetch;
    await dbClient.end();
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
