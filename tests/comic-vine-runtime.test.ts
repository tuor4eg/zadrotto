import assert from "node:assert/strict";
import { test } from "node:test";

const databaseUrl = process.env.COMIC_VINE_TEST_DATABASE_URL;
test("Comic Vine snapshots drive metadata, creator requests and offline reprocessing", { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  const { getDbClient } = await import("../src/db");
  const { fetchComicVineMetadata, getSavedComicVineBundle } = await import("../src/lib/providers/comic-vine-service");
  const { upsertMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { resolveCreatorRequest, applyCreatorRequest } = await import("../src/db/queries/creator-requests");
  const client = getDbClient();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    const url = String(input);
    const results = url.includes("/volume/")
      ? { id: 12, name: "Volume", publisher: { id: 5, name: "Publisher" }, first_issue: { id: 42 }, count_of_issues: 10, start_year: "1999", site_detail_url: "https://comicvine.gamespot.com/volume/4050-12/", extra: "raw" }
      : { id: 42, volume: { id: 12 }, person_credits: [{ id: 7, name: "Creator", role: "writer, penciler, inker" }] };
    return new Response(JSON.stringify({ status_code: 1, results }), { headers: { "content-type": "application/json" } });
  };
  try {
    const [entry] = await client`insert into media_items(code,title,media_type) values ('comic-vine-runtime','Comic','comic') returning id`;
    const options = { candidateLimit: 1, tmdbResultScanLimit: 1, providerCredentials: { "comic-vine": { apiKey: "test" } } };
    const input = { provider: "comic-vine" as const, externalId: "12", mediaType: "comic" as const };
    const metadata = await fetchComicVineMetadata(input, options);
    assert.equal(calls, 2);
    assert.equal(metadata.snapshotReferences?.length, 2);
    await upsertMediaItemMetadata({ mediaItemId: entry.id, facts: metadata.facts, sourceProvider: input.provider, sourceExternalId: input.externalId, snapshotReferences: metadata.snapshotReferences });
    const [stored] = await client`select facts from media_item_metadata where media_item_id=${entry.id}`;
    assert.equal(stored.facts.publisher, "Publisher");
    assert.equal(stored.facts.issueCount, 10);
    assert.deepEqual(stored.facts.comicVineArtistWork[0].work, ["penciler", "inker"]);
    const requests = await client`select id, external_creator_id from creator_requests where provider='comic-vine' order by external_creator_id`;
    assert.deepEqual(requests.map(row => row.external_creator_id), ["person:7", "publisher:5"]);
    for (const request of requests) {
      const decision = await resolveCreatorRequest({ requestId: request.id, decision: "create", name: request.external_creator_id === "person:7" ? "Creator" : "Publisher" });
      await applyCreatorRequest(request.id, { jobRunId: decision.jobRunId });
    }
    const roles = await client`select r.code, t.code as type from entry_creators ec join creator_roles r on r.id=ec.role_id join creators c on c.id=ec.creator_id join creator_types t on t.id=c.type_id where ec.entry_id=${entry.id} order by r.code`;
    assert.deepEqual(roles.map(row => [row.code, row.type]), [["artist", "person"], ["publisher", "organization"], ["screenwriter", "person"]]);
    const parts = await client`select part_id from provider_part_snapshot_links where media_item_id=${entry.id}`;
    assert.equal(parts.length, 1);
    assert.equal(parts[0].part_id, null);
    const bundle = await getSavedComicVineBundle(entry.id, "12");
    assert.equal(bundle.issueCreators?.length, 2);
    await upsertMediaItemMetadata({ mediaItemId: entry.id, facts: {}, sourceProvider: input.provider, sourceExternalId: input.externalId, snapshotReferences: [bundle.primary, bundle.issue!].map(row => ({ id: row.id, payloadHash: row.payloadHash })) });
    assert.equal(calls, 2);
    await upsertMediaItemMetadata({ mediaItemId: entry.id, facts: {}, sourceProvider: input.provider, sourceExternalId: input.externalId, snapshotReferences: [{ id: bundle.primary.id, payloadHash: bundle.primary.payloadHash }] });
    const [after] = await client`select facts from media_item_metadata where media_item_id=${entry.id}`;
    assert.equal(after.facts.comicVineIssueStatus, "issue-fetch-failed");
    assert.deepEqual(after.facts.comicVineArtistWork, stored.facts.comicVineArtistWork);
    assert.equal((await client`select * from creator_request_media_items where media_item_id=${entry.id}`).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    await client.end();
  }
});
