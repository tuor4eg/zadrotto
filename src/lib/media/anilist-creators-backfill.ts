import "server-only";
import { eq, sql } from "drizzle-orm";
import { mediaItems, mediaItemMetadata, jobRuns } from "@/db/schema";
import { getAnimeMissingCreatorRosterQuery } from "@/db/queries/anilist-creators-backfill";
import { attachProviderSnapshots, withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { syncAniListCreators } from "@/db/queries/anilist-creators";
import { prepareAniListCreatorSnapshot } from "@/lib/providers/anilist-creators-service";
import { createJobRun } from "@/db/queries/jobs";
import { createMetadataProviderJobContext } from "./metadata-provider-fetch";
import { isMetadataQuotaStopError, type MetadataJobResult } from "./metadata-jobs";
import type { MetadataBackfillPayload } from "./metadata-backfill";

/** A supplementary refresh: never rewrites the primary metadata or user-edited fields. */
export async function backfillAniListCreators(input: MetadataBackfillPayload & { signal?: AbortSignal; runId?: number; lockToken?: string }): Promise<MetadataJobResult> {
  const guard = input.runId && input.lockToken ? { runId: input.runId, lockToken: input.lockToken } : undefined;
  const limit = input.mediaItemId ? 1 : input.limit ?? 25;
  const items = await getAnimeMissingCreatorRosterQuery(limit, input.afterId ?? 0, input.mediaItemId, Boolean(input.force || input.mediaItemId));
  const result: MetadataJobResult = { failed: 0, retryableFailed: 0, skipped: 0, updated: 0, updatedItems: [] };
  if (!items.length) return result;
  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100, guard, input.signal);
  let afterId = input.afterId ?? 0;
  for (const item of items) {
    input.signal?.throwIfAborted();
    try {
      const refs = await context.fetchAniListCreators!({ provider: item.sourceProvider as "anilist" | "jikan", externalId: item.sourceExternalId!, mediaType: "anime" });
      input.signal?.throwIfAborted();
      await withSnapshotJobGuard(guard, async tx => {
        const [entry] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems).where(eq(mediaItems.id, item.id)).for("update");
        const [current] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
        if (entry?.mediaType !== "anime" || current?.sourceProvider !== item.sourceProvider || current.sourceExternalId !== item.sourceExternalId) {
          result.skipped++;
        } else if (refs) {
          const snapshot = await prepareAniListCreatorSnapshot(item.sourceProvider!, item.sourceExternalId!, refs, tx);
          await attachProviderSnapshots(tx, { entityType: "media-item", entityId: String(item.id) }, [{ id: snapshot.id, payloadHash: snapshot.payloadHash, purpose: "dependency" }], { kind: "system" });
          await syncAniListCreators(tx, item.id);
          result.updated++;
          result.updatedItems.push({ id: item.id, title: item.title });
        } else {
          // Exact MAL lookup found no AniList record. This is terminal for a missing-only pass, but force/refresh may retry.
          await tx.update(mediaItemMetadata).set({ facts: sql`${mediaItemMetadata.facts} || '{"anilistCreatorsUnavailable":true}'::jsonb`, updatedAt: new Date() }).where(eq(mediaItemMetadata.mediaItemId, item.id));
          result.skipped++;
        }
        afterId = item.id;
        if (guard) await tx.update(jobRuns).set({ payload: { ...inputPayload(input), afterId }, updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId));
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof Error && error.message === "provider-disabled") { result.skipped += items.length; return result; }
      if (error instanceof Error && isMetadataQuotaStopError(error.message)) result.stopError = error.message;
      else {
        console.error("AniList creator backfill failed", { mediaItemId: item.id, runId: input.runId ?? null, error: error instanceof Error ? error.message : "unknown-error" });
        result.failed++; result.retryableFailed++;
      }
      // Keep the failed ID beyond the durable cursor so a normal retry cannot lose it.
      return result;
    }
  }
  if (!input.mediaItemId && items.length === limit) await withSnapshotJobGuard(guard, async tx => {
    await createJobRun({ type: "media.metadata-backfill", payload: { ...inputPayload(input), afterId }, source: "event", maxAttempts: 3, timeoutSeconds: 300,
      retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
  });
  return result;
}
function inputPayload(input: MetadataBackfillPayload): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ creatorsOnly: true, limit: input.limit, mediaItemId: input.mediaItemId, quotaReserve: input.quotaReserve, force: input.force, mediaType: "anime" }).filter(([, value]) => value !== undefined));
}
