import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, mediaItems, mediaItemMetadata, mediaItemTitleAliases, providerSnapshotLinks, providerSnapshots } from "@/db/schema";
import { attachProviderSnapshots, lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";
import { sanitizeShikimoriDescription } from "@/lib/media/shikimori-description";
import { hasCyrillicText } from "@/lib/media/anime-shikimori-language";
import { decideMangaShikimoriFields, mangaFromSnapshot, mangaUpdatesLinkIdentity, mangaUpdatesRedirectTarget, matchesMangaUpdates, type ShikimoriBackfillPayload, type ShikimoriStats } from "@/lib/media/manga-shikimori-model";
import type { MangaShikimoriResult } from "@/lib/media/manga-shikimori-provider";

export async function getPendingMangaShikimoriItems(afterMediaItemId: number, limit: number) {
  const rows = await db.select({ aliases: sql<string[]>`coalesce((select array_agg(${mediaItemTitleAliases.value} order by ${mediaItemTitleAliases.id}) from ${mediaItemTitleAliases} where ${mediaItemTitleAliases.mediaItemId} = ${mediaItems.id}), array[]::text[])`, id: mediaItems.id, title: mediaItems.title, originalTitle: mediaItems.originalTitle, sourceExternalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.mediaType, "manga"), eq(mediaItems.metadataSearchDisabled, false), isNull(mediaItems.shikimoriEnrichmentAttemptedAt), eq(mediaItemMetadata.sourceProvider, "mangaupdates"), isNotNull(mediaItemMetadata.sourceExternalId), gt(mediaItems.id, afterMediaItemId)))
    .orderBy(asc(mediaItems.id)).limit(limit);
  return rows as Array<typeof rows[number] & { sourceExternalId: string }>;
}
export async function getMangaShikimoriEvidence(mediaItemId: number, sourceExternalId: string, executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  const snapshots = await executor.select({ snapshot: providerSnapshots, purpose: providerSnapshotLinks.purpose }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId))))
    .orderBy(asc(providerSnapshots.id));
  const urls: string[] = [];
  const refs: Array<{ id: number; payloadHash: string }> = [];
  for (const { snapshot, purpose } of snapshots) {
    if (snapshot.providerCode !== "mangaupdates" || snapshot.resourceType !== "series" || snapshot.externalId !== sourceExternalId || purpose !== "primary") continue;
    const payload = snapshot.payload as { url?: unknown; series_id?: unknown } | null;
    if (String(payload?.series_id) !== sourceExternalId) continue;
    if (typeof payload?.url === "string" && mangaUpdatesLinkIdentity(payload.url)) { urls.push(payload.url); refs.push({ id: snapshot.id, payloadHash: snapshot.payloadHash }); }
  }
  for (const { snapshot } of snapshots) {
    if (snapshot.providerCode !== "mangaupdates" || snapshot.resourceType !== "series-redirect" || snapshot.apiMethod !== "series.redirect") continue;
    const target = mangaUpdatesRedirectTarget(snapshot.payload);
    if (target && mangaUpdatesLinkIdentity(target.legacyUrl) === `legacy:${snapshot.externalId}` && urls.some(url => mangaUpdatesLinkIdentity(url) === mangaUpdatesLinkIdentity(target.canonicalUrl))) {
      urls.push(target.legacyUrl);
      refs.push({ id: snapshot.id, payloadHash: snapshot.payloadHash });
    }
  }
  const bindings = snapshots.flatMap(({ snapshot }) => {
    if (snapshot.providerCode !== "shikimori" || snapshot.resourceType !== "manga") return [];
    const manga = mangaFromSnapshot(snapshot.payload, snapshot.externalId);
    return manga && matchesMangaUpdates(manga, urls) ? [{ manga, snapshot: { id: snapshot.id, payloadHash: snapshot.payloadHash } }] : [];
  });
  const identities = new Set(bindings.map(binding => String(binding.manga.id)));
  return { urls, refs, binding: identities.size === 1 ? bindings.at(-1)! : null };
}
export async function checkpointShikimoriJob(guard: SnapshotJobGuard, payload: ShikimoriBackfillPayload) {
  await withSnapshotJobGuard(guard, tx => tx.update(jobRuns).set({ payload, updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId)).then(() => undefined));
}
export async function applyMangaShikimoriResult(input: { mediaItemId: number; sourceExternalId: string; result: MangaShikimoriResult; maxTitleAliases: number; guard: SnapshotJobGuard; checkpoint: (delta: ShikimoriStats) => ShikimoriBackfillPayload }) {
  return withSnapshotJobGuard(input.guard, async tx => {
    const [item] = await tx.select().from(mediaItems).where(and(eq(mediaItems.id, input.mediaItemId), eq(mediaItems.mediaType, "manga"), eq(mediaItems.metadataSearchDisabled, false), isNull(mediaItems.shikimoriEnrichmentAttemptedAt))).for("update").limit(1);
    if (!item) return false;
    const [metadata] = await tx.select().from(mediaItemMetadata).where(and(eq(mediaItemMetadata.mediaItemId, item.id), eq(mediaItemMetadata.sourceProvider, "mangaupdates"), eq(mediaItemMetadata.sourceExternalId, input.sourceExternalId))).for("update").limit(1);
    if (!metadata) return false;
    if (input.result.identitySnapshots?.length) await attachProviderSnapshots(tx, { entityType: "media-item", entityId: String(item.id) }, input.result.identitySnapshots.map(ref => ({ ...ref, purpose: "dependency" })), { kind: "system" });
    const evidence = await getMangaShikimoriEvidence(item.id, input.sourceExternalId, tx);
    if (input.result.manga && !matchesMangaUpdates(input.result.manga, evidence.urls)) throw new Error("INVALID_SHIKIMORI_MANGA_IDENTITY");
    if (input.result.manga) await lockProviderSnapshotReferences(tx, evidence.refs);
    // Current metadata and fields are read under the target lock, after provider HTTP.
    const aliases = await tx.select({ value: mediaItemTitleAliases.value }).from(mediaItemTitleAliases).where(eq(mediaItemTitleAliases.mediaItemId, item.id)).orderBy(asc(mediaItemTitleAliases.id));
    const currentAliases = aliases.map(alias => alias.value);
    const decision = decideMangaShikimoriFields({ ...item, aliases: currentAliases, maxTitleAliases: input.maxTitleAliases, manga: input.result.manga });
    if (JSON.stringify(currentAliases) !== JSON.stringify(decision.aliases)) {
      await tx.delete(mediaItemTitleAliases).where(eq(mediaItemTitleAliases.mediaItemId, item.id));
      if (decision.aliases.length) await tx.insert(mediaItemTitleAliases).values(decision.aliases.map(value => ({ mediaItemId: item.id, value })));
    }
    if (input.result.snapshot) await attachProviderSnapshots(tx, { entityType: "media-item", entityId: String(item.id) }, [{ ...input.result.snapshot, purpose: "dependency" }], { kind: "system" });
    await tx.update(mediaItems).set({ description: decision.description, shikimoriEnrichmentAttemptedAt: new Date(), updatedAt: new Date() }).where(eq(mediaItems.id, item.id));
    const russianTitle = hasCyrillicText(input.result.manga?.russian ?? "");
    const russianDescription = hasCyrillicText(sanitizeShikimoriDescription(input.result.manga?.description ?? ""));
    const payload = input.checkpoint({ processed: 1, matched: input.result.manga ? 1 : 0, unmatched: input.result.manga ? 0 : 1, russianTitles: russianTitle ? 1 : 0, russianDescriptions: russianDescription ? 1 : 0, requestErrors: 0, noRussian: input.result.manga && !russianTitle && !russianDescription ? 1 : 0 });
    await tx.update(jobRuns).set({ payload, updatedAt: new Date() }).where(eq(jobRuns.id, input.guard.runId));
    return true;
  });
}
