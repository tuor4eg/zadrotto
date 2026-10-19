import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { extractExternalPlatforms, resolvePlatformMappings } from "../src/lib/media/platforms";

const testUrl = process.env.PLATFORMS_TEST_DATABASE_URL;

test("platform extraction preserves Xbox pipes and resolves multiple mappings without altering facts", () => {
  const facts = { platforms: ["Xbox Series X|S", " PC ", "PC", "Linux"] };
  const before = structuredClone(facts);
  const externalPlatforms = extractExternalPlatforms(facts);
  assert.deepEqual(externalPlatforms.map(row => row.name), ["Xbox Series X|S", "PC", "Linux"]);
  const pc = { id: 1, name: "PC", slug: "pc" };
  const result = resolvePlatformMappings({ provider: "igdb", mediaType: "game", externalPlatforms,
    mappings: ["pc", "linux"].map(normalizedExternalPlatformName => ({ normalizedExternalPlatformName, platform: pc, isActive: true })) });
  assert.deepEqual(result.platforms, [pc]);
  assert.deepEqual(result.unmapped.map(row => row.name), ["Xbox Series X|S"]);
  assert.deepEqual(resolvePlatformMappings({ provider: "igdb", mediaType: "film", externalPlatforms, mappings: [] }), { platforms: [], unmapped: [] });
  assert.throws(() => extractExternalPlatforms({ platforms: [42] }));
  assert.deepEqual(facts, before);
});

test("platform requests apply current metadata, reopen mappings and survive failed-job cleanup", { skip: !testUrl }, async () => {
  const schema = `platform_runtime_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient, db } = await import("../src/db");
  const { mediaItems, mediaItemMetadata } = await import("../src/db/schema");
  const requests = await import("../src/db/queries/platform-requests");
  const platforms = await import("../src/db/queries/media-item-platforms");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text); INSERT INTO media_types VALUES('game','Игра'),('film','Фильм');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text DEFAULT 'published');
      INSERT INTO media_items VALUES(1,'one','Один','game','published'),(2,'two','Два','game','published'),(3,'film','Фильм','film','published');
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id),facts jsonb NOT NULL DEFAULT '{}',source_provider text,
        source_external_id text,source_url text,fetched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO media_item_metadata(media_item_id,source_provider,facts) VALUES(1,'igdb','{"platforms":["PC (Microsoft Windows)","Linux","Xbox Series X|S"]}');
      CREATE TABLE admin_activity_logs(id serial PRIMARY KEY,created_at timestamptz DEFAULT now(),actor_type text,admin_user_id integer,
        author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id integer,retry_of_run_id integer,created_by_admin_id integer,type text,payload jsonb DEFAULT '{}',
        source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts integer DEFAULT 0,max_attempts integer,
        timeout_seconds integer,retry_base_seconds integer,retry_max_seconds integer,locked_at timestamptz,locked_by text,lock_token text,
        lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
        actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const initialFacts = await client`SELECT facts FROM media_item_metadata ORDER BY media_item_id`;
    for (const file of ["0120_normalized_platforms.sql", "0121_platform_initial_mappings.sql", "0122_platform_backfill.sql", "0126_platform_logos.sql"]) {
      await client.begin(async tx => {
        for (const statement of readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public".', `"${schema}".`).split("--> statement-breakpoint")) await tx.unsafe(statement);
      });
    }
    assert.deepEqual(await client`SELECT facts FROM media_item_metadata ORDER BY media_item_id`, initialFacts);
    assert.equal((await client`SELECT count(*)::int n FROM platforms`)[0].n, 102);
    assert.equal((await client`SELECT count(*)::int n FROM media_item_platforms WHERE media_item_id=1`)[0].n, 2);

    const sync = async (mediaItemId: number, names: unknown, provider: string | null = "igdb") => db.transaction(async tx => {
      const [item] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).where(eq(mediaItems.id, mediaItemId)).for("update");
      const facts = { platforms: names };
      await requests.lockPlatformRequestsForMetadata(tx, { mediaItemId, provider, mediaType: item.mediaType, facts });
      const resolved = await platforms.resolveProviderPlatforms({ provider, mediaType: item.mediaType, facts }, tx);
      await tx.insert(mediaItemMetadata).values({ mediaItemId, sourceProvider: provider, facts }).onConflictDoUpdate({
        target: mediaItemMetadata.mediaItemId, set: { sourceProvider: provider, facts } });
      await platforms.syncMediaItemProviderPlatforms(tx, { mediaItemId, provider, platforms: resolved.platforms });
      await requests.syncPlatformRequestOccurrences(tx, { mediaItemId, provider, mediaType: item.mediaType,
        externalPlatforms: item.mediaType === "game" ? extractExternalPlatforms(facts) : [] });
    });
    const readPlatforms = async (id: number) => (await db.select({ platforms: platforms.mediaItemPlatformsJsonSql() }).from(mediaItems).where(eq(mediaItems.id, id)))[0].platforms;
    await Promise.all([sync(1, ["  NEW   PLATFORM  "]), sync(2, ["New platform"])]);
    assert.equal(await requests.getPendingPlatformRequestCount(), 1);
    assert.equal((await client`SELECT count(*)::int n FROM domain_events WHERE type='platform-request.created'`)[0].n, 1);
    assert.equal((await client`SELECT count(*)::int n FROM domain_event_outbox`)[0].n, 1);
    let request = (await requests.getPlatformRequests())[0];
    assert.equal((await requests.getPlatformRequestDetail(request.id))?.request.occurrenceCount, 2);
    const created = await requests.resolvePlatformRequest({ requestId: request.id, adminId: 1, decision: "create", name: "Новая платформа" });
    await assert.rejects(requests.resolvePlatformRequest({ requestId: request.id, adminId: 1, decision: "exclude" }));
    await sync(2, ["PC"]);
    const rawBefore = await client`SELECT facts FROM media_item_metadata ORDER BY media_item_id`;
    assert.deepEqual(await requests.applyPlatformRequest(request.id, { jobRunId: created.jobRunId + 999 }), { processed: 0 });
    assert.deepEqual(await requests.applyPlatformRequest(request.id, { jobRunId: created.jobRunId }), { processed: 1 });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${created.jobRunId}`;
    assert.deepEqual((await readPlatforms(1)).map(row => row.name), ["Новая платформа"]);
    assert.deepEqual((await readPlatforms(2)).map(row => row.name), ["PC"]);
    assert.deepEqual(await client`SELECT facts FROM media_item_metadata ORDER BY media_item_id`, rawBefore);
    await client`DELETE FROM job_runs WHERE id=${created.jobRunId}`;
    assert.equal((await requests.getPlatformRequestDetail(request.id))?.request.status, "processed");

    const [mapping] = await client`SELECT id,platform_id FROM provider_platform_mappings WHERE normalized_external_platform_name='new platform'`;
    const [reopened] = await Promise.all([
      requests.reopenPlatformMapping({ mappingId: Number(mapping.id), adminId: 1 }), sync(1, ["New platform"]),
    ]);
    assert.equal((await client`SELECT count(*)::int n FROM platforms WHERE id=${mapping.platform_id}`)[0].n, 0);
    await requests.applyPlatformRequest(reopened.requestId, { jobRunId: reopened.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${reopened.jobRunId}`;
    assert.deepEqual(await readPlatforms(1), []);
    assert.equal((await requests.getPlatformRequestDetail(request.id))?.request.status, "pending");
    const pc = (await client`SELECT id FROM platforms WHERE slug='pc'`)[0];
    const mac = (await client`SELECT id FROM platforms WHERE slug='mac'`)[0];
    const mapped = await requests.resolvePlatformRequest({ requestId: request.id, adminId: 1, decision: "map", platformIds: [Number(pc.id), Number(mac.id)] });
    await requests.applyPlatformRequest(request.id, { jobRunId: mapped.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${mapped.jobRunId}`;
    assert.deepEqual((await readPlatforms(1)).map(row => row.slug), ["mac", "pc"]);

    await sync(2, ["Ignored platform"]);
    request = (await requests.getPlatformRequests())[0];
    const excluded = await requests.resolvePlatformRequest({ requestId: request.id, adminId: 1, decision: "exclude" });
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(requests.applyPlatformRequest(request.id, { jobRunId: excluded.jobRunId, signal: cancelled.signal }));
    await client`UPDATE job_runs SET status='failed' WHERE id=${excluded.jobRunId}`;
    await client`DELETE FROM job_runs WHERE id=${excluded.jobRunId}`;
    assert.equal((await requests.getPlatformRequestDetail(request.id))?.request.status, "failed");
    assert.equal((await requests.getPlatformRequestsPage()).total, 0);
    const failedPage = await requests.getPlatformRequestsPage({ all: true, searchQuery: "  IGNORED  PLATFORM ", page: 99 });
    assert.equal(failedPage.total, 1);
    assert.equal(failedPage.page, 1);
    assert.equal(failedPage.items[0].status, "failed");
    const retry = await requests.retryPlatformRequest({ requestId: request.id, adminId: 1 });
    await requests.applyPlatformRequest(request.id, { jobRunId: retry.jobRunId });
    await client`UPDATE job_runs SET status='succeeded' WHERE id=${retry.jobRunId}`;
    await sync(2, ["Ignored platform"]);
    assert.deepEqual(await readPlatforms(2), []);
    assert.equal(await requests.getPendingPlatformRequestCount(), 0);
    await sync(3, ["Film platform"]);
    assert.equal(await requests.getPendingPlatformRequestCount(), 0);
    assert.deepEqual(await readPlatforms(3), []);
    assert.equal((await client`SELECT count(*)::int n FROM platforms`)[0].n, 102);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
