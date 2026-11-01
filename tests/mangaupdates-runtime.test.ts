import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const databaseUrl = process.env.MANGAUPDATES_TEST_DATABASE_URL;
const redisUrl = process.env.MANGAUPDATES_TEST_REDIS_URL;
test("MangaUpdates full snapshots, cache, reference validation and role import", { skip: !databaseUrl || !redisUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  process.env.REDIS_URL = redisUrl!;
  const { getDbClient } = await import("../src/db");
  const { getRedisClient, closeRedisClient } = await import("../src/lib/services/redis");
  const { fetchMangaUpdatesMetadata, requestMangaUpdates, prepareMangaUpdatesSnapshotReferences, getSavedMangaUpdatesBundle } = await import("../src/lib/providers/mangaupdates-service");
  const { providerSnapshotMangaBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
  const { upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const client = getDbClient();
  const redis = (await getRedisClient())!;
  const suffix = randomUUID();
  const id = String(100_000_000_000 + Math.floor(Math.random() * 100_000_000_000));
  const personId = Number(id) + 1;
  const publisherId = Number(id) + 2;
  const payload = { series_id: Number(id), title: "Runtime Manga", type: "Manga", year: "2020", status: "2 Volumes (Complete)", completed: true,
    url: `https://www.mangaupdates.com/series/${suffix}`, description: "Description", associated: [{ title: "Alias" }], genres: [{ genre: "Action" }],
    authors: [{ author_id: personId, name: `Person ${suffix}`, type: "Author" }, { author_id: personId, name: `Person ${suffix}`, type: "Artist" }],
    publishers: [{ publisher_id: publisherId, publisher_name: `Publisher ${suffix}`, type: "Original" }],
    image: { url: { original: "https://cdn.mangaupdates.com/test.jpg" } }, unmapped_field: { retain: [1, 2, 3] } };
  const input = { provider: "mangaupdates" as const, mediaType: "manga" as const, externalId: id };
  let requests = 0;
  let charges = 0;
  const options = { candidateLimit: 2, tmdbResultScanLimit: 1, beforeProviderSearch: async () => { charges++; return true; } };
  const fetchImpl: typeof fetch = async () => { requests++; return Response.json(payload); };
  let entryId: number | null = null;
  const creatorIds: number[] = [];
  try {
    const metadata = await fetchMangaUpdatesMetadata(input, options, fetchImpl);
    assert.equal(requests, 1);
    assert.equal(charges, 1);
    const refs = metadata.snapshotReferences!;
    const bundle = await prepareMangaUpdatesSnapshotReferences(id, refs);
    assert.deepEqual(bundle.primary.payload, payload);
    assert.equal(bundle.projection.fields.title, "Runtime Manga");
    await fetchMangaUpdatesMetadata(input, { ...options, snapshotReuseAfter: new Date(Date.now() - 60_000) }, fetchImpl);
    assert.equal(requests, 1, "reusable snapshot makes no HTTP request");
    assert.equal(charges, 1, "reusable snapshot does not consume quota");
    await assert.rejects(prepareMangaUpdatesSnapshotReferences(id, [{ ...refs[0], payloadHash: "0".repeat(64) }]), /PROVIDER_SNAPSHOT_CHANGED/);
    await assert.rejects(prepareMangaUpdatesSnapshotReferences(String(Number(id) + 3), refs), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
    await assert.rejects(fetchMangaUpdatesMetadata(input, options, async () => Response.json({ ...payload, type: "Novel" })), /UNSUPPORTED_PROVIDER_MEDIA_TYPE/);
    assert.deepEqual((await prepareMangaUpdatesSnapshotReferences(id, refs)).primary.payload, payload, "Novel response cannot replace known-good raw snapshot");
    const body = { search: suffix, page: 1, perpage: 2 };
    let searches = 0;
    const searchFetch: typeof fetch = async () => { searches++; return Response.json({ results: [{ record: payload }] }); };
    await requestMangaUpdates("series/search", options, body, searchFetch);
    await requestMangaUpdates("series/search", options, body, searchFetch);
    assert.equal(searches, 1);
    const beforeBypass = charges;
    await requestMangaUpdates("series/search", { ...options, bypassCache: true }, body, searchFetch);
    assert.equal(searches, 2);
    assert.equal(charges, beforeBypass + 1);
    const [entry] = await client`insert into media_items(code,title,media_type) values (${`mu-runtime-${suffix}`},'Existing title','manga') returning id`;
    entryId = entry.id;
    await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "mangaupdates", sourceExternalId: id, facts: {}, fetchedAt: null });
    const pendingInput = { afterId: 0, throughId: entry.id, mediaItemIds: [entry.id], onlyMissingSnapshots: true };
    assert.equal((await providerSnapshotMangaBatchQuery(pendingInput)).length, 1, "cached raw without an entry link still needs processing");
    for (const [externalId, name, type] of [[`person:${personId}`, `Person ${suffix}`, "person"], [`publisher:${publisherId}`, `Publisher ${suffix}`, "organization"]]) {
      const [creator] = await client`insert into creators(name,slug,type_id) select ${name},${`mu-${type}-${suffix}`},id from creator_types where code=${type} returning id`;
      creatorIds.push(creator.id);
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values ('mangaupdates',${externalId},${creator.id})`;
    }
    for (let run = 0; run < 2; run++) await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "mangaupdates", sourceExternalId: id, facts: {}, snapshotReferences: refs });
    assert.equal((await providerSnapshotMangaBatchQuery(pendingInput)).length, 0, "linked primary is excluded from missing-only processing");
    const saved = await getSavedMangaUpdatesBundle(entry.id, id);
    assert.equal(saved.primary.id, bundle.primary.id);
    const roles = await client`select r.code,t.code as type from entry_creators ec join creator_roles r on r.id=ec.role_id join creators c on c.id=ec.creator_id join creator_types t on t.id=c.type_id where ec.entry_id=${entry.id} order by r.code`;
    assert.deepEqual(roles.map(row => [row.code, row.type]), [["artist", "person"], ["publisher", "organization"], ["writer", "person"]]);
    const [row] = await client`select title,release_year from media_items where id=${entry.id}`;
    assert.equal(row.title, "Existing title");
    const beforeCooldown = requests;
    await assert.rejects(requestMangaUpdates(`series/${id}`, options, undefined, async () => new Response(null, { status: 429, headers: { "retry-after": "12" } })), error => Boolean(error && typeof error === "object" && "retryAfterSeconds" in error && error.retryAfterSeconds === 12));
    await assert.rejects(requestMangaUpdates(`series/${id}`, options, undefined, fetchImpl), error => Boolean(error && typeof error === "object" && "status" in error && error.status === 429));
    assert.equal(requests, beforeCooldown, "shared cooldown prevents another HTTP request");
    assert.equal(row.release_year, 2020);
  } finally {
    await client.begin(async tx => {
      if (entryId !== null) {
        await tx`delete from provider_snapshot_links where entity_type='media-item' and entity_id=${String(entryId)}`;
        await tx`delete from media_items where id=${entryId}`;
      }
      await tx`delete from creator_requests where provider='mangaupdates' and external_creator_id in (${`person:${personId}`},${`publisher:${publisherId}`})`;
      await tx`delete from provider_creator_bindings where provider='mangaupdates' and external_creator_id in (${`person:${personId}`},${`publisher:${publisherId}`})`;
      for (const creatorId of creatorIds) await tx`delete from creators where id=${creatorId}`;
      await tx`delete from provider_snapshots where provider_code='mangaupdates' and external_id=${id}`;
    });
    // The dedicated Redis database belongs exclusively to this test invocation.
    await redis.flushDb();
    await closeRedisClient();
    await client.end();
  }
});
