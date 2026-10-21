import type { DbTransaction } from "@/db/transaction";
import "server-only";
import { describeTmdbFilmSource } from "./tmdb-film-adapter";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { providerSnapshots } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard, type StoredProviderSnapshot } from "@/db/queries/provider-snapshots";
import type { TitleMetadataInput, TitleMetadataOptions, MediaTitleMetadata } from "@/lib/covers/types";
import { describeBookSource, getBookDependencyDescriptors, normalizeBookSnapshots } from "./book-adapters";
import { fetchBookSnapshotBundle } from "./book-fetch";
import { validateSnapshotReferences, snapshotHash, type SnapshotReference } from "./snapshot-values";
import type { BookProjection, BookProviderCode, RawSnapshot } from "./types";

export function isBookSnapshotProvider(provider: string): provider is BookProviderCode {
  return ["fantlab","google-books","open-library"].includes(provider);
}
export function bookProjectionLegacyFacts(projection: BookProjection): Record<string,unknown> {
  const authors = projection.contributors.filter(item=>item.roleCode==="writer");
  return {authors:authors.map(item=>item.name), ...(projection.provider==="fantlab" ? {fantlabAuthors:authors.flatMap(item=>item.externalId ? [{id:item.externalId,name:item.name}] : [])}: {})};
}
export function assertCompleteBookProjection(primary: RawSnapshot, dependencies: RawSnapshot[]) {
  const projection = normalizeBookSnapshots(primary,dependencies);
  if (!projection.contributorsComplete) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return projection;
}
export async function getSavedBookBundle(provider: BookProviderCode, externalId: string) {
  const primary = await getProviderSnapshot(describeBookSource(provider,externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const descriptors=getBookDependencyDescriptors(primary);
  const found=descriptors.length ? await db.select().from(providerSnapshots).where(or(...descriptors.map(desc=>and(eq(providerSnapshots.providerCode,desc.providerCode),eq(providerSnapshots.resourceType,desc.resourceType),eq(providerSnapshots.externalId,desc.externalId),eq(providerSnapshots.apiMethod,desc.apiMethod),eq(providerSnapshots.requestKey,snapshotHash(desc.requestParams)))))) : [];
  const dependencies=descriptors.map(desc=>found.find(row=>row.providerCode===desc.providerCode && row.resourceType===desc.resourceType && row.externalId===desc.externalId && row.apiMethod===desc.apiMethod && row.requestKey===snapshotHash(desc.requestParams)));
  if (dependencies.some(row=>!row)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const completeDependencies=dependencies as StoredProviderSnapshot[];
  return {primary,dependencies:completeDependencies,projection:assertCompleteBookProjection(primary,completeDependencies)};
}
export async function prepareBookSnapshotReferences(provider: string, externalId: string, refs: SnapshotReference[], executor:DbTransaction|typeof db=db) {
  if (!isBookSnapshotProvider(provider) || !validateSnapshotReferences(refs)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const rows = await executor.select().from(providerSnapshots).where(inArray(providerSnapshots.id,refs.map(ref=>ref.id))).orderBy(asc(providerSnapshots.id));
  if (rows.length!==refs.length || rows.some(row=>refs.find(ref=>ref.id===row.id)?.payloadHash!==row.payloadHash)) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const descriptor=describeBookSource(provider,externalId);
  const primary=rows.find(row=>row.providerCode===provider && row.resourceType===descriptor.resourceType && row.externalId===descriptor.externalId && row.apiMethod===descriptor.apiMethod && row.requestKey===snapshotHash(descriptor.requestParams));
  if (!primary) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const required = getBookDependencyDescriptors(primary);
  const dependencies = required.map(desc=>rows.find(row=>row.providerCode===desc.providerCode && row.resourceType===desc.resourceType && row.externalId===desc.externalId && row.apiMethod===desc.apiMethod && row.requestKey===snapshotHash(desc.requestParams)));
  if (dependencies.some(row=>!row) || rows.length!==1+required.length) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const complete = dependencies as StoredProviderSnapshot[];
  return {primary,dependencies:complete,projection:assertCompleteBookProjection(primary,complete)};
}
export async function fetchBookMetadata(input: TitleMetadataInput, options: TitleMetadataOptions, guard?: SnapshotJobGuard): Promise<MediaTitleMetadata> {
  if (!isBookSnapshotProvider(input.provider)) throw new Error("UNSUPPORTED_SNAPSHOT_PROVIDER");
  const bundle = await fetchBookSnapshotBundle(describeBookSource(input.provider,input.externalId),{
    requestStartedAt:providerRequestStartedAt,
    async beforeRequest() {
      const allowed = await options.beforeProviderSearch?.(input.provider);
      if (allowed===false || typeof allowed==="string") throw new Error(typeof allowed==="string"?allowed:"provider-daily-limit");
    },
    saveSnapshot: raw=>saveProviderSnapshot(raw,guard ?? options.snapshotJobGuard),
    signal:options.signal,
    reuseSnapshot: options.snapshotReuseAfter ? async descriptor => {
      const cached=await getProviderSnapshot(descriptor);
      return cached && cached.fetchedAt >= options.snapshotReuseAfter! ? cached : null;
    } : undefined,
    apiKey:options.providerCredentials?.["google-books"]?.apiKey,
  });
  const projection=assertCompleteBookProjection(bundle.primary,bundle.dependencies);
  const rows=[bundle.primary,...bundle.dependencies];
  return {provider:input.provider,externalId:projection.externalId,sourceUrl:projection.sourceUrl,facts:bookProjectionLegacyFacts(projection),
    snapshotReferences:rows.map(row=>({id:row.id!,payloadHash:row.payloadHash})),
    ...(options.enrichTitleFields ? {fields:projection.fields}: {})};
}
/** Dedicated admin inspection can also show a partially fetched, not-yet-linked source. */
export async function getRawEntitySnapshot(snapshotId: number, mediaItemId: number) {
  const {providerSnapshotLinks,mediaItemMetadata,mediaItems}=await import("@/db/schema");
  const linked=(await db.select({snapshot:providerSnapshots}).from(providerSnapshotLinks).innerJoin(providerSnapshots,eq(providerSnapshots.id,providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType,"media-item"),eq(providerSnapshotLinks.entityId,String(mediaItemId)),eq(providerSnapshotLinks.snapshotId,snapshotId))).limit(1))[0]?.snapshot;
  if(linked)return linked;
  const [source]=await db.select({provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,mediaItemId));
  if (source?.provider === "tmdb" && source.externalId) {
    const [item] = await db.select({mediaType:mediaItems.mediaType}).from(mediaItems).where(eq(mediaItems.id,mediaItemId));
    if (item?.mediaType !== "film") return null;
    const film = await getProviderSnapshot(describeTmdbFilmSource(source.externalId));
    return film?.id === snapshotId ? film : null;
  }
  if(!source?.provider || !source.externalId || !isBookSnapshotProvider(source.provider))return null;
  const primary=await getProviderSnapshot(describeBookSource(source.provider,source.externalId));
  if(!primary)return null;
  if(primary.id===snapshotId)return primary;
  const [dependency]=await db.select().from(providerSnapshots).where(eq(providerSnapshots.id,snapshotId)).limit(1);
  if(!dependency)return null;
  return getBookDependencyDescriptors(primary).some(desc=>desc.providerCode===dependency.providerCode && desc.externalId===dependency.externalId && desc.resourceType===dependency.resourceType && desc.apiMethod===dependency.apiMethod && snapshotHash(desc.requestParams)===dependency.requestKey)?dependency:null;
}
export async function getCurrentBookPrimarySnapshot(mediaItemId:number) {
  const {mediaItemMetadata,mediaItems}=await import("@/db/schema");
  const [source]=await db.select({provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,mediaItemId));
  if (source?.provider === "tmdb" && source.externalId) {
    const [item] = await db.select({mediaType:mediaItems.mediaType}).from(mediaItems).where(eq(mediaItems.id,mediaItemId));
    return item?.mediaType === "film" ? getProviderSnapshot(describeTmdbFilmSource(source.externalId)) : null;
  }
  if(!source?.provider || !source.externalId || !isBookSnapshotProvider(source.provider))return null;
  return getProviderSnapshot(describeBookSource(source.provider,source.externalId));
}
