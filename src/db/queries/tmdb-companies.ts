import { syncTmdbCreatorRoster } from "./tmdb-creator-roster";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { providerCreatorBindings, mediaItems, mediaItemMetadata, providerSnapshotLinks, providerSnapshots, gameCompanyProfiles } from "@/db/schema";
import { extractTmdbCompanyReferences, type TmdbCompanyReference } from "@/lib/creators/tmdb-companies";
import { describeTmdbFilmSource } from "@/lib/providers/tmdb-film-adapter";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import { lockProviderSnapshotReferences } from "./provider-snapshots";
import type { CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";

export const TMDB_COMPANY_APPROVAL_JOB = "media.tmdb-company-approve";
/** Caller holds the media item lock. Lock all old/new request identities in stable order. */
export async function syncTmdbCompanyCreators(tx: CreatorTransaction, mediaItemId: number, references: (Omit<TmdbCompanyReference, "roleCode"> & { roleCode: "production_company" | "network" })[], options: { mediaType?: "film" | "series"; roleCode?: "production_company" | "network" } = {}) {
  return syncTmdbCreatorRoster(tx, mediaItemId, references, { mediaType: options.mediaType ?? "film", roleCodes: [options.roleCode ?? "production_company"] });
}

/** Current linked movie evidence only; caller holds the media item lock. No network. */
export async function getTmdbFilmCompanySnapshot(tx: CreatorTransaction | typeof db, mediaItemId: number) {
  const [metadata] = await tx.select({ sourceProvider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId, mediaType: mediaItems.mediaType }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, mediaItemId));
  if (metadata?.mediaType !== "film" || metadata.sourceProvider !== "tmdb" || !metadata.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
  const descriptor = describeTmdbFilmSource(metadata.externalId);
  const rows = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"),
      eq(providerSnapshots.providerCode, "tmdb"), eq(providerSnapshots.externalId, metadata.externalId), eq(providerSnapshots.resourceType, "movie"),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length !== 1) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  return { snapshot: rows[0].snapshot, references: extractTmdbCompanyReferences(rows[0].snapshot) };
}

export async function syncTmdbFilmCompanies(tx: CreatorTransaction, mediaItemId: number, options: { enqueueLogos?: boolean; enqueueApproval?: boolean } = {}) {
  const { snapshot, references } = await getTmdbFilmCompanySnapshot(tx, mediaItemId);
  await lockProviderSnapshotReferences(tx, [{ id: snapshot.id, payloadHash: snapshot.payloadHash }]);
  const result = await syncTmdbCompanyCreators(tx, mediaItemId, references);
  await saveTmdbOrganizationProfiles(tx, references, snapshot);
  await tx.update(mediaItemMetadata).set({ facts: sql`${mediaItemMetadata.facts} - 'productionCompanies'`, updatedAt: new Date() }).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
  const externalIds = references.map(ref => ref.externalId);
  for (let offset = 0; offset < externalIds.length; offset += 1000) {
    const ids = externalIds.slice(offset, offset + 1000);
    if (options.enqueueApproval !== false) await createJobRun({ type: TMDB_COMPANY_APPROVAL_JOB, payload: { externalIds: ids }, source: "event",
      maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
    if (options.enqueueLogos === true) {
      const bindings = await tx.select({ creatorId: providerCreatorBindings.creatorId }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, ids)));
      for (const creatorId of [...new Set(bindings.map(binding => binding.creatorId))].sort((a, b) => a - b)) await enqueueCreatorImageFill(tx, creatorId);
    }
  }
  return result;
}

export async function saveTmdbOrganizationProfiles(tx: CreatorTransaction, references: (Omit<TmdbCompanyReference, "roleCode"> & { roleCode: "production_company" | "network" })[], snapshot: {id:number;payloadHash:string;fetchedAt:Date}) {
  for (const ref of [...references].sort((a, b) => a.externalId.localeCompare(b.externalId))) {
    const imageUrl = ref.logoPath ? `https://image.tmdb.org/t/p/original${ref.logoPath}` : null;
    await tx.insert(gameCompanyProfiles).values({ provider: "tmdb", externalId: ref.externalId, name: ref.name, sourceUrl: ref.sourceUrl,
      details: { snapshotId: snapshot.id, payloadHash: snapshot.payloadHash, logoPath: ref.logoPath }, imageUrl, profileStatus: "ready", imageStatus: imageUrl ? "pending" : "missing", fetchedAt: snapshot.fetchedAt })
      .onConflictDoUpdate({ target: [gameCompanyProfiles.provider, gameCompanyProfiles.externalId], set: {
        name: ref.name, sourceUrl: ref.sourceUrl, details: { snapshotId: snapshot.id, payloadHash: snapshot.payloadHash, logoPath: ref.logoPath },
        imageUrl, profileStatus: "ready", fetchedAt: snapshot.fetchedAt, updatedAt: new Date(),
        imageStatus: sql`case when ${gameCompanyProfiles.imageUrl} is not distinct from ${imageUrl} then ${gameCompanyProfiles.imageStatus} when ${imageUrl}::text is null then 'missing' else 'pending' end`,
        imageObjectKey: sql`case when ${gameCompanyProfiles.imageUrl} is not distinct from ${imageUrl} then ${gameCompanyProfiles.imageObjectKey} else null end`,
        imageContentHash: sql`case when ${gameCompanyProfiles.imageUrl} is not distinct from ${imageUrl} then ${gameCompanyProfiles.imageContentHash} else null end`,
        error: sql`case when ${gameCompanyProfiles.imageUrl} is not distinct from ${imageUrl} then ${gameCompanyProfiles.error} else null end`,
      }, setWhere: sql`${gameCompanyProfiles.fetchedAt} is null or ${gameCompanyProfiles.fetchedAt} <= ${snapshot.fetchedAt.toISOString()}::timestamptz` });
  }
}
