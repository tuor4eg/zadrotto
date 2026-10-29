import assert from "node:assert/strict";
import { test } from "node:test";

const url = process.env.COMIC_VINE_TEST_DATABASE_URL;
test("issue aggregation applies linked snapshots without losing partial creators", { skip: !url }, async () => {
  process.env.DATABASE_URL = url!;
  const { db, getDbClient } = await import("../src/db");
  const dbClient = getDbClient();
  const { saveProviderSnapshot, attachProviderSnapshots } = await import("../src/db/queries/provider-snapshots");
  const { describeComicVineIssue, describeComicVineVolume } = await import("../src/lib/providers/comic-vine-adapter");
  const { applyComicVineIssueAggregation } = await import("../src/db/queries/comic-vine-issue-aggregation");
  const { mediaItemMetadata } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const now = new Date();
  const raw = (payload: object) => ({ payload, contentType: "application/json", payloadHash: "", requestStartedAt: now, fetchedAt: now });
  try {
    const [item] = await dbClient`insert into media_items(code,title,media_type) values (${`aggregation-${Date.now()}`},'Comic','comic') returning id`;
    const volume = await saveProviderSnapshot({ ...describeComicVineVolume("444"), ...raw({ id: 444, count_of_issues: 2, first_issue: { id: 441 }, issues: [{ id: 441 }, { id: 442 }] }) });
    const issue = async (id: number, role: string) => saveProviderSnapshot({ ...describeComicVineIssue(String(id)), ...raw({ id, volume: { id: 444 }, person_credits: [{ id: 44, name: "Creator", role }] }) });
    const a = await issue(441, "writer, penciler");
    const b = await issue(442, "writer, inker");
    await db.insert(mediaItemMetadata).values({ mediaItemId: item.id, sourceProvider: "comic-vine", sourceExternalId: "444", facts: { comicVinePersonCreators: [{ externalId: "person:55", name: "Previous", roleCode: "artist", position: 0 }] } });
    await db.transaction(tx => attachProviderSnapshots(tx, { entityType: "media-item", entityId: String(item.id) }, [{ id: volume.id, payloadHash: volume.payloadHash, purpose: "primary" }], { kind: "system" }));
    const ref = (row: typeof volume) => ({ id: row.id, payloadHash: row.payloadHash });
    const partial = await db.transaction(tx => applyComicVineIssueAggregation(tx, { mediaItemId: item.id, externalId: "444", volume: ref(volume), issue: ref(a) }));
    assert.equal(partial.complete, false);
    const [first] = await db.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
    assert.ok((first.facts.comicVinePersonCreators as { externalId: string }[]).some(row => row.externalId === "person:55"));
    const complete = await db.transaction(tx => applyComicVineIssueAggregation(tx, { mediaItemId: item.id, externalId: "444", volume: ref(volume), issue: ref(b) }));
    assert.equal(complete.complete, true);
    const [final] = await db.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
    const people = final.facts.comicVinePersonCreators as { externalId: string; roleCode: string; issueCount: number; work?: string[] }[];
    assert.equal(people.length, 2);
    assert.ok(people.every(row => row.issueCount === 2));
    assert.deepEqual(people.find(row => row.roleCode === "artist")?.work, ["penciler", "inker"]);
  } finally { await dbClient.end(); }
});
