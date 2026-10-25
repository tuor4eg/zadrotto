import { syncTmdbCreatorRoster } from "./tmdb-creator-roster";
import { and, eq, inArray } from "drizzle-orm";
import { mediaItems, mediaItemMetadata, providerSnapshotLinks, providerSnapshots, providerCreatorBindings } from "@/db/schema";
import { describeTmdbSeriesSource, extractTmdbSeriesCreatorReferences } from "@/lib/providers/tmdb-series-adapter";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import type { CreatorTransaction } from "./creators";
import { saveTmdbOrganizationProfiles, TMDB_COMPANY_APPROVAL_JOB } from "./tmdb-companies";
import { TMDB_DIRECTOR_APPROVAL_JOB } from "./tmdb-directors";
import { lockProviderSnapshotReferences } from "./provider-snapshots";
import { createJobRun } from "./jobs";
import { enqueueCreatorImageFill } from "./creator-image-jobs";

type SeriesReferences = ReturnType<typeof extractTmdbSeriesCreatorReferences>;
/** Complete rosters only. Null/malformed evidence is rejected by the adapter before entering here. */
export async function syncTmdbSeriesCreatorReferences(tx: CreatorTransaction, mediaItemId: number, references: SeriesReferences) {
  return syncTmdbCreatorRoster(tx, mediaItemId, [...references.companies, ...references.networks, ...references.creators, ...references.showrunners], { mediaType: "series", roleCodes: ["production_company", "network", "creator", "showrunner"], localizedNames: true });
}
export async function clearTmdbSeriesCreators(tx: CreatorTransaction, mediaItemId: number) {
  return syncTmdbSeriesCreatorReferences(tx, mediaItemId, { companies: [], networks: [], creators: [], showrunners: [] });
}
/** Caller owns the entry lock; exact TV descriptor/hash remains locked through roster commit. */
export async function syncTmdbSeriesCreators(tx: CreatorTransaction, mediaItemId: number, options: { enqueueApproval?: boolean; enqueueLogos?: boolean } = {}) {
  const [metadata] = await tx.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, mediaItemId));
  if (metadata?.mediaType !== "series" || metadata.provider !== "tmdb" || !metadata.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
  const descriptor = describeTmdbSeriesSource(metadata.externalId);
  const rows = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"),
      eq(providerSnapshots.providerCode, "tmdb"), eq(providerSnapshots.externalId, metadata.externalId), eq(providerSnapshots.resourceType, descriptor.resourceType),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length !== 1) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const snapshot = rows[0].snapshot;
  await lockProviderSnapshotReferences(tx, [{ id: snapshot.id, payloadHash: snapshot.payloadHash }]);
  const references = extractTmdbSeriesCreatorReferences(snapshot);
  const result = await syncTmdbSeriesCreatorReferences(tx, mediaItemId, references);
  await saveTmdbOrganizationProfiles(tx, [...references.companies, ...references.networks], snapshot);
  for (const [type, refs] of [[TMDB_COMPANY_APPROVAL_JOB, [...references.companies, ...references.networks]], [TMDB_DIRECTOR_APPROVAL_JOB, [...references.creators, ...references.showrunners]]] as const) {
    const externalIds = [...new Set(refs.map(ref => ref.externalId))];
    for (let offset = 0; offset < externalIds.length; offset += 1000) {
      const ids = externalIds.slice(offset, offset + 1000);
      if (options.enqueueApproval !== false) await createJobRun({ type, payload: { externalIds: ids }, source: "event", maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
      if (options.enqueueLogos === true) {
        const bindings = await tx.select({ creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, ids)));
        for (const id of [...new Set(bindings.map(row => row.creatorId))].sort((a,b) => a-b)) await enqueueCreatorImageFill(tx, id);
      }
    }
  }
  return result;
}
