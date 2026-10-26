import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { enqueueCreatorImageFills } from "./creator-image-jobs";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { mediaItems, mediaItemMetadata, providerSnapshotLinks, providerSnapshots, jobRuns, entryCreatorSources, creators } from "@/db/schema";
import { describeAniListCreators, extractAniListCreatorReferences, parseAniListCreatorPayload } from "@/lib/providers/anilist-creators-adapter";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import { attachProviderSnapshots, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";
import { prepareAniListCreatorSnapshot } from "@/lib/providers/anilist-creators-service";
import type { SnapshotReference } from "@/lib/providers/snapshot-values";
import { syncProviderCreatorRoster } from "./tmdb-creator-roster";
import type { CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";

export function aniListCreatorsMissingImagesQuery(mediaItemId: number, executor: DbTransaction | typeof db = db) {
  return executor.selectDistinct({ creatorId: creators.id }).from(entryCreatorSources)
    .innerJoin(creators, eq(creators.id, entryCreatorSources.creatorId))
    .where(and(eq(entryCreatorSources.entryId, mediaItemId), eq(entryCreatorSources.provider, "anilist"),
      isNull(creators.avatarObjectKey), isNull(creators.avatarSource)))
    .orderBy(asc(creators.id));
}

export const ANILIST_CREATOR_APPROVAL_JOB = "media.anilist-creator-approve";
const roles = ["director", "production_company", "producer"] as const;
export async function clearAniListCreators(tx: CreatorTransaction, mediaItemId: number) {
  return syncProviderCreatorRoster(tx, mediaItemId, [], { provider: "anilist", mediaType: "anime", roleCodes: [...roles] });
}

/** Shared snapshot workflow: refresh attaches raw only; process updates participants, never primary metadata. */
export async function commitAniListCreatorSnapshot(input: {
  mediaItemId: number; expectedSource: { provider: string; externalId: string }; references: SnapshotReference[];
  process: boolean; jobGuard: SnapshotJobGuard; checkpoint: Record<string, unknown>;
}) {
  await withSnapshotJobGuard(input.jobGuard, async tx => {
    const [entry] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).for("update");
    const [metadata] = await tx.select({ provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
      .from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId));
    if (entry?.mediaType !== "anime" || metadata?.provider !== input.expectedSource.provider || metadata.externalId !== input.expectedSource.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    const snapshot = await prepareAniListCreatorSnapshot(metadata.provider!, metadata.externalId!, input.references, tx);
    await attachProviderSnapshots(tx, { entityType: "media-item", entityId: String(input.mediaItemId) }, [
      { id: snapshot.id, payloadHash: snapshot.payloadHash, purpose: "dependency" },
    ], { kind: "system" });
    if (input.process) await syncAniListCreators(tx, input.mediaItemId);
    await tx.update(jobRuns).set({ payload: input.checkpoint, updatedAt: new Date() }).where(eq(jobRuns.id, input.jobGuard.runId));
  });
}
/** Caller holds the entry lock. Both primary and supplemental sources are validated against current metadata. */
export async function syncAniListCreators(tx: CreatorTransaction, mediaItemId: number, options: { enqueueApproval?: boolean } = {}) {
  const [metadata] = await tx.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, mediaItemId));
  if (metadata?.mediaType !== "anime" || !["anilist", "jikan"].includes(metadata.provider ?? "") || !metadata.externalId) {
    return clearAniListCreators(tx, mediaItemId);
  }
  const descriptor = describeAniListCreators("1");
  const rows = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "dependency"),
      eq(providerSnapshots.providerCode, "anilist"), eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.apiMethod, descriptor.apiMethod),
      eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  const matching = rows.filter(({ snapshot }) => {
    const payload = parseAniListCreatorPayload(snapshot.payload);
    return metadata.provider === "anilist" ? String(payload.mediaId) === metadata.externalId : String(payload.idMal) === metadata.externalId;
  });
  if (matching.length !== 1) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const snapshot = matching[0].snapshot;
  await lockProviderSnapshotReferences(tx, [{ id: snapshot.id, payloadHash: snapshot.payloadHash }]);
  if (snapshot.externalId !== String(parseAniListCreatorPayload(snapshot.payload).mediaId)) throw new Error("INVALID_ANILIST_ROSTER");
  const references = extractAniListCreatorReferences(snapshot.payload);
  const result = await syncProviderCreatorRoster(tx, mediaItemId, references, { provider: "anilist", mediaType: "anime", roleCodes: [...roles], localizedNames: true });
  await tx.update(mediaItemMetadata).set({ facts: sql`(${mediaItemMetadata.facts} - 'studios' - 'anilistCreatorsUnavailable') || '{"anilistCreatorsComplete":true}'::jsonb`, updatedAt: new Date() }).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
  const ids = [...new Set(references.map(ref => ref.externalId))];
  if (options.enqueueApproval !== false) for (let offset = 0; offset < ids.length; offset += 1000) {
    await createJobRun({ type: ANILIST_CREATOR_APPROVAL_JOB, payload: { externalIds: ids.slice(offset, offset + 1000) }, source: "event",
      maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
  }
  // The shared roster has already locked all participating owners in ascending order.
  await enqueueCreatorImageFills(tx, (await aniListCreatorsMissingImagesQuery(mediaItemId, tx)).map(row => row.creatorId));
  return result;
}
