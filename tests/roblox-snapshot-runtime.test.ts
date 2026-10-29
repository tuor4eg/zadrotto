import assert from "node:assert/strict";
import { test } from "node:test";

const databaseUrl = process.env.ROBLOX_TEST_DATABASE_URL;
test("Roblox snapshots import and reprocess both owner types without changing entry identity", { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  const { getDbClient } = await import("../src/db");
  const { fetchRobloxMetadata, getSavedRobloxBundle } = await import("../src/lib/providers/roblox-service");
  const { upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { resolveCreatorRequest, applyCreatorRequest } = await import("../src/db/queries/creator-requests");
  const { providerSnapshotRobloxBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
  const client = getDbClient();
  let requests = 0;
  let ownerName = "Owner";
  const fetchImpl: typeof fetch = async input => {
    requests++;
    const url = new URL(String(input));
    if (url.hostname === "games.roblox.com") {
      const id = Number(url.searchParams.get("universeIds"));
      return Response.json({ extra: "original envelope", data: [{ id, rootPlaceId: id + 1, name: `Game ${id}`, description: "Description", created: "2021-01-01T00:00:00Z", creator: { id: id === 601 ? 8 : id === 701 ? 9 : 7, type: id === 101 || id === 601 ? "User" : "Group", name: ownerName }, maxPlayers: 20, price: 0, createVipServersAllowed: true, visits: 300 }] });
    }
    return Response.json({ data: [] });
  };
  try {
    for (const id of [101, 201]) {
      const [entry] = await client`insert into media_items(code,title,media_type) values (${`roblox-runtime-${id}`}, 'Existing title', 'roblox') returning id`;
      await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values (${entry.id},'roblox',${String(id)},${JSON.stringify({ creatorName: "Old owner", createdAt: "2021-01-01T00:00:00Z" })}::jsonb)`;
      const metadata = await fetchRobloxMetadata({ provider: "roblox", externalId: String(id), mediaType: "roblox" }, { candidateLimit: 1, tmdbResultScanLimit: 1 }, fetchImpl);
      await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "roblox", sourceExternalId: String(id), facts: {}, snapshotReferences: metadata.snapshotReferences, expectedSource: { provider: "roblox", externalId: String(id) } });
      const [request] = await client`select id from creator_requests where provider='roblox' and external_creator_id=${id === 101 ? "user:7" : "group:7"}`;
      const decision = await resolveCreatorRequest({ requestId: request.id, decision: "create", name: "Owner" });
      await applyCreatorRequest(request.id, { jobRunId: decision.jobRunId });
      const saved = await getSavedRobloxBundle(String(id));
      const payload = saved.primary.payload as { games: { extra: string; data: { visits: number }[] } };
      assert.equal(payload.games.extra, "original envelope");
      assert.equal(payload.games.data[0].visits, 300);
      const afterFetch = requests;
      await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "roblox", sourceExternalId: String(id), facts: {}, snapshotReferences: [{ id: saved.primary.id, payloadHash: saved.primary.payloadHash }], expectedSource: { provider: "roblox", externalId: String(id) } });
      assert.equal(requests, afterFetch);
      const [row] = await client`select m.title,m.release_year,md.facts,md.source_url from media_items m join media_item_metadata md on md.media_item_id=m.id where m.id=${entry.id}`;
      assert.equal(row.title, "Existing title");
      assert.equal(row.release_year, 2021);
      assert.equal(row.source_url, `https://www.roblox.com/games/${id + 1}`);
      assert.deepEqual(row.facts, { maxPlayers: 20, privateServers: true });
    }
    const bindings = await client`select external_creator_id from provider_creator_bindings where provider='roblox' and active order by external_creator_id`;
    assert.deepEqual(bindings.map(row => row.external_creator_id), ["group:7", "user:7"]);
    const roles = await client`select t.code as type, r.code as role from entry_creators e join creator_roles r on r.id=e.role_id join creators c on c.id=e.creator_id join creator_types t on t.id=c.type_id order by t.code`;
    assert.deepEqual(roles.map(row => [row.type, row.role]), [["organization", "developer"], ["person", "developer"]]);
    ownerName = "Updated owner";
    const updated = await fetchRobloxMetadata({ provider: "roblox", externalId: "101", mediaType: "roblox" }, { candidateLimit: 1, tmdbResultScanLimit: 1 }, fetchImpl);
    const [entry] = await client`select id from media_items where code='roblox-runtime-101'`;
    await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "roblox", sourceExternalId: "101", facts: {}, snapshotReferences: updated.snapshotReferences });
    const [creator] = await client`select c.name,b.external_creator_name from creators c join provider_creator_bindings b on b.creator_id=c.id where b.provider='roblox' and b.external_creator_id='user:7' and b.active`;
    assert.equal(creator.name, "Owner");
    assert.equal(creator.external_creator_name, "Updated owner");
    const concurrent = await Promise.all([301, 401].map(async id => {
      const [entry] = await client`insert into media_items(code,title,media_type) values (${`roblox-runtime-${id}`}, 'Concurrent', 'roblox') returning id`;
      const metadata = await fetchRobloxMetadata({ provider: "roblox", externalId: String(id), mediaType: "roblox" }, { candidateLimit: 1, tmdbResultScanLimit: 1 }, fetchImpl);
      return { entry, metadata, id };
    }));
    await Promise.all(concurrent.map(({ entry, metadata, id }) => upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "roblox", sourceExternalId: String(id), facts: {}, snapshotReferences: metadata.snapshotReferences })));
    const [sameOwner] = await client`select count(*)::int as count from provider_creator_bindings where provider='roblox' and external_creator_id='group:7' and active`;
    assert.equal(sameOwner.count, 1);
    for (const [id, externalId, name, decisionKind] of [[601, "user:8", "Unique Owner", "create"], [701, "group:9", "Ignored Owner", "exclude"]] as const) {
      ownerName = name;
      const [entry] = await client`insert into media_items(code,title,media_type) values (${`roblox-runtime-${id}`}, 'Approval', 'roblox') returning id`;
      const metadata = await fetchRobloxMetadata({ provider: "roblox", externalId: String(id), mediaType: "roblox" }, { candidateLimit: 1, tmdbResultScanLimit: 1 }, fetchImpl);
      await upsertMediaItemMetadata({ mediaItemId: entry.id, sourceProvider: "roblox", sourceExternalId: String(id), facts: {}, snapshotReferences: metadata.snapshotReferences });
      const [request] = await client`select id from creator_requests where provider='roblox' and external_creator_id=${externalId}`;
      const [before] = await client`select count(*)::int as count from entry_creators where entry_id=${entry.id}`;
      assert.equal(before.count, 0);
      const decision = await resolveCreatorRequest({ requestId: request.id, decision: decisionKind, ...(decisionKind === "create" ? { autoApprove: true } : {}) });
      await applyCreatorRequest(request.id, { jobRunId: decision.jobRunId });
      const [after] = await client`select count(*)::int as count from entry_creators where entry_id=${entry.id}`;
      assert.equal(after.count, decisionKind === "create" ? 1 : 0);
    }
    await assert.rejects(fetchRobloxMetadata({ provider: "roblox", externalId: "501", mediaType: "roblox" }, { candidateLimit: 1, tmdbResultScanLimit: 1 }, async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })), error => Boolean(error && typeof error === "object" && "status" in error && error.status === 429 && "retryAfterSeconds" in error && error.retryAfterSeconds === 30));
    const query = providerSnapshotRobloxBatchQuery({ afterId: 0, throughId: 100000, batchSize: 25, onlyMissingSnapshots: true }).toSQL();
    const plan = await client.unsafe(`explain (analyze, buffers, format json) ${query.sql}`, query.params as never[]);
    assert.ok(plan.length > 0);
  } finally { await client.end(); }
});
