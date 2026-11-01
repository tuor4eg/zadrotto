import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { mediaItems, mediaItemMetadata, providerSnapshotLinks, providerSnapshots } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { prepareAniListCreatorSnapshot } from "@/lib/providers/anilist-creators-service";
import { describeAniListMetadata } from "@/lib/providers/anilist-metadata-adapter";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import { changeProviderSnapshotPurpose, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";

/** Exact indexed descriptor and entity link; facts are not evidence of a saved primary response. */
export function missingAniListMetadataSnapshotSql() {
  const descriptor = describeAniListMetadata("1");
  return sql`not exists (select 1 from ${providerSnapshots} s
    inner join ${providerSnapshotLinks} l on l.snapshot_id=s.id
      and l.entity_type='media-item' and l.entity_id=${mediaItems.id}::text and l.purpose='primary'
    where s.provider_code='anilist' and s.resource_type='anime'
      and s.external_id=${mediaItemMetadata.sourceExternalId} and s.api_method=${descriptor.apiMethod}
      and s.request_key=${snapshotHash(descriptor.requestParams)} and s.request_params=${JSON.stringify(descriptor.requestParams)}::jsonb)`;
}

export function hasPrimaryAniListCreatorSnapshotSql() {
  return sql`exists (select 1 from ${providerSnapshotLinks} l inner join ${providerSnapshots} s on s.id=l.snapshot_id
    where l.entity_type='media-item' and l.entity_id=${mediaItems.id}::text and l.purpose='primary'
      and s.provider_code='anilist' and s.resource_type='anime' and s.api_method='anime.creators')`;
}

/** Caller holds the media item lock and has verified its current source. No HTTP or roster writes. */
export async function repairAniListCreatorSnapshotLinksInTransaction(tx: DbTransaction, mediaItemId: number, externalId: string) {
  const rows = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)),
      eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, "anilist"),
      eq(providerSnapshots.resourceType, "anime"), eq(providerSnapshots.apiMethod, "anime.creators")));
  if (!rows.length) return;
  if (rows.length !== 1) throw new Error("AMBIGUOUS_ANILIST_SNAPSHOTS");
  const ref = { id: rows[0].snapshot.id, payloadHash: rows[0].snapshot.payloadHash };
  await prepareAniListCreatorSnapshot("anilist", externalId, [ref], tx);
  await changeProviderSnapshotPurpose(tx, { entityType: "media-item", entityId: String(mediaItemId) }, ref, "primary", "dependency", { kind: "system" });
}

export async function repairAniListCreatorSnapshotLinks(mediaItemId: number, externalId: string, guard?: SnapshotJobGuard) {
  await withSnapshotJobGuard(guard, async tx => {
    const [entry] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).where(eq(mediaItems.id, mediaItemId)).for("update");
    const [source] = await tx.select({ provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
      .from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
    if (entry?.mediaType !== "anime" || source?.provider !== "anilist" || source.externalId !== externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
    await repairAniListCreatorSnapshotLinksInTransaction(tx, mediaItemId, externalId);
  });
}
