import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { emptyShikimoriStats, type ShikimoriBackfillPayload, type ShikimoriStats } from "@/lib/media/manga-shikimori-model";

const testUrl = process.env.MANGA_TEST_DATABASE_URL;
test("manga Shikimori changes preserve locked manual fields, source identity, evidence and fenced counters", { skip: !testUrl }, async t => {
  const admin = postgres(testUrl!, { max: 1, onnotice: () => undefined });
  const schema = `manga_shikimori_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const { dbClient } = await import("@/db");
  const queries = await import("@/db/queries/manga-shikimori-backfill");
  const snapshots = await import("@/db/queries/provider-snapshots");
  try {
    await admin.unsafe(`create schema ${schema};set search_path=${schema},public`);
    for (const table of ["media_items", "media_item_metadata", "media_item_title_aliases", "provider_snapshots", "provider_snapshot_links", "job_runs"]) await admin.unsafe(`create table ${schema}.${table} (like public.${table} including all)`);
    const serials = await admin`select table_name,column_name from information_schema.columns where table_schema=${schema} and column_default like 'nextval(%'`;
    for (const [index, column] of serials.entries()) {
      await admin.unsafe(`create sequence ${schema}.test_serial_${index} start 1000000`);
      await admin.unsafe(`alter table "${column.table_name}" alter column "${column.column_name}" set default nextval('${schema}.test_serial_${index}')`);
    }
    await admin`insert into media_items(id,code,title,description,media_type,publication_status) values(1,'manga-shiki-test','Manual title',null,'manga','published')`;
    await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id) values(1,'mangaupdates','123')`;
    await admin`insert into job_runs(id,type,status,source,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values(1,'media.anime-shikimori-backfill','running','manual','lease',now()+interval '10 minutes',now(),now(),3,300,60,3600)`;
    const guard = { runId: 1, lockToken: "lease" };
    const captured: Array<{ query: string; params: unknown[] }> = [];
    dbClient.options.debug = (_connection, query, params) => { if (query.startsWith("select")) captured.push({ query, params: [...params] }); };
    assert.equal((await queries.getPendingMangaShikimoriItems(0, 5)).length, 1);
    dbClient.options.debug = false;
    assert.equal(captured.length, 1);
    const pendingQuery = captured[0];
    const [plan] = await dbClient.unsafe("explain(analyze,buffers,format json) " + pendingQuery.query, pendingQuery.params as never[]);
    t.diagnostic(JSON.stringify({ accessPath: "pending manga by media_type/id, metadata source join, bounded aliases", rows: 1, plan: plan["QUERY PLAN"] }));

    const raw = { providerCode: "mangaupdates", resourceType: "series", externalId: "123", apiMethod: "series.get", requestParams: {}, payload: { series_id: 123, url: "https://www.mangaupdates.com/series/abc/name" }, payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date() };
    const primary = await snapshots.saveProviderSnapshot(raw, guard);
    const { db } = await import("@/db");
    await db.transaction(tx => snapshots.attachProviderSnapshots(tx, { entityType: "media-item", entityId: "1" }, [{ id: primary.id, payloadHash: primary.payloadHash, purpose: "primary" }], { kind: "system" }));
    const manga = { id: "456", russian: "Русское название", description: "Русское описание", externalLinks: [{ url: "https://www.mangaupdates.com/series.html?id=4565" }] };
    const redirect = await snapshots.saveProviderSnapshot({ ...raw, resourceType: "series-redirect", externalId: "4565", apiMethod: "series.redirect", payload: { legacyUrl: "https://www.mangaupdates.com/series.html?id=4565", location: "https://www.mangaupdates.com/series/abc/name", html: null } }, guard);
    const dependency = await snapshots.saveProviderSnapshot({ ...raw, providerCode: "shikimori", resourceType: "manga", externalId: manga.id, apiMethod: "mangas.graphql", payload: { data: { mangas: [manga] } } }, guard);
    const result = { manga, snapshot: { id: dependency.id, payloadHash: dependency.payloadHash }, identitySnapshots: [{ id: redirect.id, payloadHash: redirect.payloadHash }] };
    let payload: ShikimoriBackfillPayload = { mediaTypes: ["manga"], batchSize: 5, pauseMs: 0, afterMediaItemId: 0 };
    const checkpoint = (delta: ShikimoriStats) => {
      payload = { ...payload, checkpoint: { afterMediaItemId: 1, counters: delta } };
      return payload;
    };
    const apply = (sourceExternalId = "123", snapshot = result.snapshot) => queries.applyMangaShikimoriResult({ mediaItemId: 1, sourceExternalId, result: { ...result, snapshot }, maxTitleAliases: 2, guard, checkpoint });
    // Read current fields under lock; replace the last alias and refresh English description.
    await admin`update media_items set description='Manual English description' where id=1`;
    await admin`insert into media_item_title_aliases(media_item_id,value) values(1,'First manual alias'),(1,'Second manual alias')`;
    assert.equal(await apply(), true);
    const [first] = await admin`select title,description,shikimori_enrichment_attempted_at from media_items where id=1`;
    assert.equal(first.title, "Manual title"); assert.equal(first.description, "Русское описание"); assert.ok(first.shikimori_enrichment_attempted_at);
    const aliases = await admin`select value from media_item_title_aliases order by id`;
    assert.deepEqual(aliases.map(alias => alias.value), ["First manual alias", "Русское название"]);
    assert.deepEqual(payload.checkpoint?.counters, { ...emptyShikimoriStats(), processed: 1, matched: 1, russianTitles: 1, russianDescriptions: 1 });
    assert.ok((await queries.getMangaShikimoriEvidence(1, "123")).binding);
    assert.equal(await apply(), false, "already attempted row cannot double count");
    await admin`update media_items set shikimori_enrichment_attempted_at=null,description=null where id=1`;
    await admin`update media_item_metadata set source_external_id='999' where media_item_id=1`;
    assert.equal(await apply(), false, "changed source is reread under lock");
    await admin`update media_item_metadata set source_external_id='123' where media_item_id=1`;
    // A changed raw snapshot must roll back fields, aliases and checkpoint together.
    await admin`delete from media_item_title_aliases`;
    await assert.rejects(apply("123", { id: dependency.id, payloadHash: "stale" }), /PROVIDER_SNAPSHOT_CHANGED/);
    const [rolledBack] = await admin`select description,shikimori_enrichment_attempted_at from media_items where id=1`;
    assert.equal(rolledBack.description, null); assert.equal(rolledBack.shikimori_enrichment_attempted_at, null);
    assert.equal((await admin`select value from media_item_title_aliases`).length, 0);
    await admin`update job_runs set lock_token='new-owner' where id=1`;
    await assert.rejects(apply(), /STALE_SNAPSHOT_JOB/);
    assert.equal((await admin`select description from media_items where id=1`)[0].description, null);
  } finally {
    dbClient.options.debug = false;
    await dbClient.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
  }
});
