import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { jobRuns } from "@/db/schema";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getCoverSettings } from "@/db/queries/cover-settings";
import { applyAnimeShikimoriBackfillResult, getPendingAnimeShikimoriBackfillItems, markAnimeShikimoriBackfillSkipped } from "@/db/queries/anime-shikimori-backfill";
import { applyMangaShikimoriResult, checkpointShikimoriJob, getMangaShikimoriEvidence, getPendingMangaShikimoriItems } from "@/db/queries/manga-shikimori-backfill";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getAniListShikimoriEnrichment } from "@/lib/covers/providers/anilist";
import { runWithProviderRequestTimeout } from "@/lib/covers/provider-request-timeout";
import { hasCyrillicText } from "./anime-shikimori-language";
import { decideAnimeShikimoriBackfill, needsAnimeShikimoriEnrichment } from "./anime-shikimori-backfill-core";
import { emptyShikimoriStats, type ShikimoriBackfillPayload, type ShikimoriStats } from "./manga-shikimori-model";
import { fetchMangaShikimori } from "./manga-shikimori-provider";
import { JobError } from "@/lib/jobs/types";

export async function backfillFromShikimori(payload: ShikimoriBackfillPayload, guard: SnapshotJobGuard, signal: AbortSignal) {
  const [settings, covers] = await Promise.all([getArchiveSettings(), getCoverSettings()]);
  let current = payload;
  const after = payload.checkpoint?.afterMediaItemId ?? payload.afterMediaItemId;
  const checkpoint = (id: number, delta: Partial<ShikimoriStats>) => {
    const counters = { ...(current.checkpoint?.counters ?? emptyShikimoriStats()) };
    for (const key of Object.keys(delta) as Array<keyof ShikimoriStats>) counters[key] += delta[key] ?? 0;
    current = { ...current, checkpoint: { afterMediaItemId: id, counters } };
    return current;
  };
  const [anime, manga] = await Promise.all([
    payload.mediaTypes.includes("anime") ? getPendingAnimeShikimoriBackfillItems({ afterMediaItemId: after, limit: payload.batchSize + 1 }) : [],
    payload.mediaTypes.includes("manga") ? getPendingMangaShikimoriItems(after, payload.batchSize + 1) : [],
  ]);
  const candidates = [...anime.map(item => ({ type: "anime" as const, item })), ...manga.map(item => ({ type: "manga" as const, item }))].sort((a, b) => a.item.id - b.item.id);
  const items = candidates.slice(0, payload.batchSize);
  for (const entry of items) {
    signal.throwIfAborted();
    const { item } = entry;
    let updated = false;
    // Provider errors never consume the pending record or advance its cursor.
    let result: Awaited<ReturnType<typeof fetchMangaShikimori>> | Awaited<ReturnType<typeof getAniListShikimoriEnrichment>>;
    try {
      if (entry.type === "manga") {
        const evidence = await getMangaShikimoriEvidence(item.id, item.sourceExternalId);
        if (!evidence.urls.length) {
          // Missing raw provider proof is not a terminal no-match. Leave the item pending.
          await checkpointShikimoriJob(guard, checkpoint(item.id, {}));
          continue;
        }
        result = await runWithProviderRequestTimeout(covers.providerRequestTimeoutMs, () => fetchMangaShikimori({ titles: [item.title, item.originalTitle, ...entry.item.aliases].filter((title): title is string => Boolean(title)), boundId: evidence.binding ? String(evidence.binding.manga.id) : undefined, evidenceUrls: evidence.urls, guard, signal, pauseMs: payload.pauseMs }));
      } else {
        if (!needsAnimeShikimoriEnrichment(entry.item)) {
          updated = await markAnimeShikimoriBackfillSkipped({ mediaItemId: item.id, sourceExternalId: item.sourceExternalId, jobGuard: guard, shouldMark: locked => !needsAnimeShikimoriEnrichment({ aliases: locked.aliases.map(alias => alias.value), description: locked.description }), checkpoint: async tx => { await tx.update(jobRuns).set({ payload: checkpoint(item.id, { processed: 1 }), updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId)); } });
          if (updated) continue;
        }
        result = await runWithProviderRequestTimeout(covers.providerRequestTimeoutMs, () => getAniListShikimoriEnrichment(Number(item.sourceExternalId)));
        if (result.kind === "transient-error") throw new Error("SHIKIMORI_REQUEST_FAILED");
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError && error.code === "lease-lost") throw error;
      await checkpointShikimoriJob(guard, checkpoint(current.checkpoint?.afterMediaItemId ?? after, { requestErrors: 1 }));
      const retry = error && typeof error === "object" ? error as { status?: number; retryAfterSeconds?: number } : null;
      if (retry?.status === 429 || (retry?.status === 503 && retry.retryAfterSeconds)) throw new JobError("shikimori-deferred", "Shikimori временно ограничил запросы.", { deferSeconds: Math.max(1, retry.retryAfterSeconds ?? 60), cause: error });
      throw new JobError("shikimori-request-failed", "Не удалось получить данные Shikimori. Запись будет проверена повторно.", { retryable: true, cause: error });
    }
    signal.throwIfAborted();
    if ("manga" in result) {
      updated = await applyMangaShikimoriResult({ mediaItemId: item.id, sourceExternalId: item.sourceExternalId, result, maxTitleAliases: settings.maxTitleAliases, guard, checkpoint: delta => checkpoint(item.id, delta) });
    } else if (result.kind === "terminal") {
      const enrichment = result;
      updated = await applyAnimeShikimoriBackfillResult({ mediaItemId: item.id, sourceExternalId: item.sourceExternalId, jobGuard: guard,
        decide: locked => decideAnimeShikimoriBackfill({ ...locked, aliases: locked.aliases.map(alias => alias.value), maxTitleAliases: settings.maxTitleAliases, shikimoriDescription: enrichment.description, shikimoriRussian: enrichment.russian }),
        checkpoint: async (tx, previous, decision) => { await tx.update(jobRuns).set({ payload: checkpoint(item.id, { processed: 1, matched: enrichment.status === "enriched" ? 1 : 0, unmatched: enrichment.status === "enriched" ? 0 : 1, russianTitles: decision.aliases.some(alias => !previous.aliases.includes(alias)) ? 1 : 0, russianDescriptions: decision.description !== previous.description ? 1 : 0, noRussian: enrichment.status === "enriched" && !hasCyrillicText(enrichment.russian ?? "") && !hasCyrillicText(enrichment.description ?? "") ? 1 : 0 }), updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId)); },
      });
    }
    if (!updated) await checkpointShikimoriJob(guard, checkpoint(item.id, {}));
    if (payload.pauseMs && entry !== items.at(-1)) await pause(payload.pauseMs, undefined, { signal });
  }
  if (payload.mediaTypes.includes("manga") && candidates.length > items.length) throw new JobError("shikimori-continue", "Следующая партия обогащения Shikimori.", { deferSeconds: Math.max(1, Math.ceil(payload.pauseMs / 1000)) });
  return current.checkpoint?.counters ?? emptyShikimoriStats();
}
