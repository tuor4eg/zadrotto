import { and, eq, inArray } from "drizzle-orm";
import { mediaItemMetadata, mediaItems, providerPartSnapshotLinks, providerSnapshotLinks, providerSnapshots } from "@/db/schema";
import { attachPartProviderSnapshot, guardSnapshotJob, lockProviderSnapshotReferences, type SnapshotJobGuard } from "./provider-snapshots";
import type { DbTransaction } from "@/db/transaction";
import { syncComicVineCreators } from "./comic-vine-creators";
import { aggregateComicVineIssues, comicVineIssueIds } from "@/lib/providers/comic-vine-issue-aggregation";
import type { ComicVineCreatorReference } from "@/lib/providers/comic-vine-adapter";
import { describeComicVineIssue, describeComicVineVolume } from "@/lib/providers/comic-vine-adapter";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";

/** Called inside the guarded transaction; raw and source are checked before working changes. */
export async function applyComicVineIssueAggregation(tx: DbTransaction, input: {
  mediaItemId: number; externalId: string; volume: SnapshotReference; issue?: SnapshotReference; guard?: SnapshotJobGuard;
}) {
  await guardSnapshotJob(tx, input.guard);
  const [item] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).for("update");
  const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId));
  if (item?.mediaType !== "comic" || metadata?.sourceProvider !== "comic-vine" || metadata.sourceExternalId !== input.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
  const refs = [input.volume, ...(input.issue ? [input.issue] : [])];
  await lockProviderSnapshotReferences(tx, refs);
  const [volume] = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(input.mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.id, input.volume.id), eq(providerSnapshots.providerCode, "comic-vine"), eq(providerSnapshots.resourceType, "volume"), eq(providerSnapshots.externalId, input.externalId)));
  if (!volume || snapshotHash(volume.snapshot.payload) !== input.volume.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const volumeDescriptor = describeComicVineVolume(input.externalId);
  if (volume.snapshot.apiMethod !== volumeDescriptor.apiMethod || volume.snapshot.requestKey !== snapshotHash(volumeDescriptor.requestParams) || snapshotHash(volume.snapshot.requestParams) !== snapshotHash(volumeDescriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const issueIds = comicVineIssueIds(volume.snapshot);
  if (input.issue) {
    const [candidate] = await tx.select().from(providerSnapshots).where(eq(providerSnapshots.id, input.issue.id));
    if (!candidate || !issueIds.includes(candidate.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
    const descriptor = describeComicVineIssue(candidate.externalId);
    if (candidate.providerCode !== descriptor.providerCode || candidate.resourceType !== descriptor.resourceType || candidate.apiMethod !== descriptor.apiMethod || candidate.requestKey !== snapshotHash(descriptor.requestParams) || snapshotHash(candidate.payload) !== candidate.payloadHash) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
    await attachPartProviderSnapshot(tx, input.mediaItemId, input.issue);
  }
  const linked = issueIds.length ? await tx.select({ snapshot: providerSnapshots }).from(providerPartSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerPartSnapshotLinks.snapshotId))
    .where(and(eq(providerPartSnapshotLinks.mediaItemId, input.mediaItemId), eq(providerSnapshots.providerCode, "comic-vine"), eq(providerSnapshots.resourceType, "issue"), inArray(providerSnapshots.externalId, issueIds))) : [];
  const snapshots = linked.map(row => row.snapshot).filter(row => row.apiMethod === "issue.details" && row.requestKey === snapshotHash({ version: 1 }));
  await lockProviderSnapshotReferences(tx, snapshots.map(row => ({ id: row.id, payloadHash: row.payloadHash })));
  if (snapshots.some(row => snapshotHash(row.payload) !== row.payloadHash)) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const byId = new Map(snapshots.map(row => [row.externalId, row]));
  const ordered = issueIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const complete = ordered.length === issueIds.length;
  const proposed = aggregateComicVineIssues(input.externalId, ordered);
  const old = Array.isArray(metadata.facts.comicVinePersonCreators) ? metadata.facts.comicVinePersonCreators as ComicVineCreatorReference[] : [];
  const previous = new Map(old.map(row => [`${row.externalId}:${row.roleCode}`, row]));
  const current = new Set(proposed.map(row => `${row.externalId}:${row.roleCode}`));
  const partial = proposed.map(row => {
    const prior = previous.get(`${row.externalId}:${row.roleCode}`) as (ComicVineCreatorReference & { issueCount?: number }) | undefined;
    return prior ? { ...row, issueCount: Math.max(row.issueCount, prior.issueCount ?? 0),
      ...(row.work || prior.work ? { work: [...new Set([...(prior.work ?? []), ...(row.work ?? [])])] } : {}) } : row;
  });
  const people: ComicVineCreatorReference[] = complete ? proposed : [...partial, ...old.filter(row => !current.has(`${row.externalId}:${row.roleCode}`))];
  const publisher = Array.isArray(metadata.facts.comicVinePublisherCreators) ? metadata.facts.comicVinePublisherCreators as ComicVineCreatorReference[] : [];
  const facts = { ...metadata.facts, comicVineIssuesAggregated: true, comicVinePersonCreators: people,
    comicVineArtistWork: people.filter(row => row.roleCode === "artist").map(row => ({ externalId: row.externalId, work: row.work })) };
  await tx.update(mediaItemMetadata).set({ facts, updatedAt: new Date() }).where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId));
  await syncComicVineCreators(tx, input.mediaItemId, publisher, people);
  await guardSnapshotJob(tx, input.guard);
  return { complete, processed: ordered.length, total: issueIds.length };
}
