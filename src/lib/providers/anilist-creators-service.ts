import { JobError } from "@/lib/jobs/types";
import { creatorProfileDescriptor } from "./creator-profile-targets";
import { validateCreatorProfilePayload } from "./creator-profile-fetch";
import type { StoredProviderSnapshot, SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getAnimeCreatorDisplay } from "@/db/queries/anilist-creator-display";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { creatorRequests, creatorRequestMediaItems, creatorRoles, mediaItems, mediaItemMetadata, providerSnapshots } from "@/db/schema";
import { providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import type { TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { describeAniListCreators, extractAniListCreatorReferences, parseAniListCreatorPayload } from "./anilist-creators-adapter";
import { fetchAniListCreatorPayload } from "./anilist-creators-fetch";
import { openAniListCreatorProgress } from "./anilist-creator-progress";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";

export async function fetchAniListCreatorSnapshot(input: TitleMetadataInput, options: TitleMetadataOptions) {
  if (input.mediaType !== "anime" || !["anilist", "jikan"].includes(input.provider)) throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  let requestStartedAt = await providerRequestStartedAt();
  const saved = options.snapshotReuseAfter ? await getSavedAniListCreatorSnapshot(input.provider, input.externalId) : null;
  if (saved && saved.fetchedAt >= options.snapshotReuseAfter!) {
    await seedAniListDirectorImageSnapshots(saved, options.snapshotJobGuard, options.signal);
    return [{ id: saved.id, payloadHash: saved.payloadHash }];
  }
  const progress = options.snapshotJobGuard ? await openAniListCreatorProgress({ ...options.snapshotJobGuard,
    externalId: input.externalId, byMalId: input.provider === "jikan", startedAt: requestStartedAt }) : undefined;
  if (progress) requestStartedAt = progress.startedAt;
  let payload;
  try {
    payload = await fetchAniListCreatorPayload({ externalId: input.externalId, byMalId: input.provider === "jikan" }, options, { progress });
  } catch (error) {
    if (error instanceof Error && /^(INVALID_ANILIST|INCOMPLETE_ANILIST|CONFLICTING_ANILIST|ANILIST_SOURCE_CHANGED|ANILIST_GRAPHQL_ERROR)/.test(error.message)) await progress?.clear();
    throw error;
  }
  if (!payload) { await progress?.clear(); return undefined; }
  const snapshot = await saveProviderSnapshot({ ...describeAniListCreators(String(payload.mediaId)), payload,
    payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  await progress?.clear();
  await seedAniListDirectorImageSnapshots(snapshot, options.snapshotJobGuard, options.signal);
  return [{ id: snapshot.id, payloadHash: snapshot.payloadHash }];
}
export async function prepareAniListCreatorSnapshot(provider: string, externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const [snapshot] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!snapshot || snapshot.payloadHash !== refs[0].payloadHash || snapshotHash(snapshot.payload) !== snapshot.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const p = parseAniListCreatorPayload(snapshot.payload);
  const descriptor = describeAniListCreators(String(p.mediaId));
  if (!["anilist", "jikan"].includes(provider) || snapshot.providerCode !== descriptor.providerCode || snapshot.resourceType !== descriptor.resourceType
    || snapshot.externalId !== descriptor.externalId || snapshot.apiMethod !== descriptor.apiMethod || snapshot.requestKey !== snapshotHash(descriptor.requestParams) || snapshotHash(snapshot.requestParams) !== snapshotHash(descriptor.requestParams)
    || (provider === "anilist" ? String(p.mediaId) !== externalId : String(p.idMal) !== externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return snapshot;
}

/** Indexed exact descriptor probes; no dependency link is needed for reusable raw evidence. */
export function savedAniListCreatorSnapshotQuery(provider: string, externalId: string, executor: DbTransaction | typeof db = db) {
  return executor.select().from(providerSnapshots).where(and(
    eq(providerSnapshots.providerCode, "anilist"), eq(providerSnapshots.resourceType, "anime"), eq(providerSnapshots.apiMethod, "anime.creators"),
    eq(providerSnapshots.requestKey, snapshotHash({ version: 1 })), eq(providerSnapshots.requestParams, sql`'{"version":1}'::jsonb`),
    provider === "anilist" ? eq(providerSnapshots.externalId, externalId) : sql`${providerSnapshots.payload}->>'idMal'=${externalId}`,
  )).limit(2);
}
export async function getSavedAniListCreatorSnapshot(provider: string, externalId: string, executor: DbTransaction | typeof db = db) {
  if (!["anilist", "jikan"].includes(provider) || !/^[1-9][0-9]*$/.test(externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const rows = await savedAniListCreatorSnapshotQuery(provider, externalId, executor);
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("AMBIGUOUS_ANILIST_SNAPSHOTS");
  return prepareAniListCreatorSnapshot(provider, externalId, [{ id: rows[0].id, payloadHash: rows[0].payloadHash }], executor);
}
export async function isAniListCreatorSnapshotSupported(mediaItemId: number) {
  const [row] = await db.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.mediaType, "anime"), sql`${mediaItemMetadata.sourceProvider} in ('anilist','jikan')`, sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`)).limit(1);
  return Boolean(row);
}
export async function getAniListCreatorMigrationComparison(id: number, snapshot: Awaited<ReturnType<typeof prepareAniListCreatorSnapshot>>) {
  const references = extractAniListCreatorReferences(snapshot.payload);
  const current = await getAnimeCreatorDisplay(id);
  const occurrences = await db.select({ externalId: creatorRequests.externalCreatorId, name: creatorRequestMediaItems.externalCreatorName,
    roleCode: creatorRoles.code, sourcePosition: creatorRequestMediaItems.sourcePosition }).from(creatorRequestMediaItems)
    .innerJoin(creatorRequests, eq(creatorRequests.id, creatorRequestMediaItems.requestId)).innerJoin(creatorRoles, eq(creatorRoles.id, creatorRequestMediaItems.roleId))
    .where(and(eq(creatorRequestMediaItems.mediaItemId, id), eq(creatorRequests.provider, "anilist")));
  const canonical = (rows: { externalId: string | null; name: string; roleCode: string; sourcePosition: number | null }[]) => rows.map(row => ({
    externalId: row.externalId, name: row.name, roleCode: row.roleCode, sourcePosition: row.sourcePosition,
  })).sort((a,b) => a.roleCode.localeCompare(b.roleCode) || (a.sourcePosition ?? -1) - (b.sourcePosition ?? -1) || String(a.externalId).localeCompare(String(b.externalId)));
  const roleNames = { director: "directors", production_company: "productionCompanies", producer: "producers" } as const;
  const proposed: Record<string, unknown> = { directors: [], productionCompanies: [], producers: [] };
  for (const ref of references) (proposed[roleNames[ref.roleCode]] as unknown[]).push({ name: ref.name, externalId: ref.externalId, sourcePosition: ref.sourcePosition });
  return { id, current: { ...current }, proposed, legacyKeys: [], blockers:
    JSON.stringify(canonical(occurrences)) === JSON.stringify(canonical(references)) ? [] : ["creator-roster-difference"] };
}

/** A captured Staff image response seeds the same shared raw cache as an explicit Staff request. */
export async function seedAniListDirectorImageSnapshots(snapshot: StoredProviderSnapshot, guard?: SnapshotJobGuard, signal?: AbortSignal) {
  const anime = parseAniListCreatorPayload(snapshot.payload);
  const seen = new Set<number>();
  for (const row of anime.staff) {
    if (row.role !== "Director" || seen.has(row.id) || !("image" in row)) continue;
    seen.add(row.id);
    const target = { provider: "anilist", resourceType: "person", externalId: String(row.id) } as const;
    const payload = { id: row.id, name: { full: row.name }, image: row.image ?? null, siteUrl: row.siteUrl ?? null };
    signal?.throwIfAborted();
    try {
      validateCreatorProfilePayload(target, payload);
      await saveProviderSnapshot({ ...creatorProfileDescriptor(target), payload, payloadHash: snapshotHash(payload), contentType: "application/json",
        requestStartedAt: snapshot.requestStartedAt, fetchedAt: snapshot.fetchedAt }, guard);
    } catch (error) {
      signal?.throwIfAborted();
      if ((error instanceof JobError && error.code === "lease-lost") || (error instanceof Error && (error.name === "AbortError" || error.message === "STALE_SNAPSHOT_JOB"))
        || (guard && typeof error === "object" && error !== null && "code" in error && ["57014", "55P03", "25P03"].includes(String(error.code)))) throw error;
      // Portraits are optional enrichment. A missing profile remains eligible for the ordinary image-fill retry.
      console.warn("AniList director image cache skipped", { externalId: target.externalId, code: error instanceof Error && error.message.startsWith("INVALID_") ? error.message : "PROFILE_CACHE_UNAVAILABLE" });
    }
  }
}
