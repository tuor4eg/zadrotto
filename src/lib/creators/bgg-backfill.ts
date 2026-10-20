import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { setTimeout as delay } from "node:timers/promises";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaItemMetadata } from "@/db/schema";
import { syncProviderCreators, autoApproveBggCreatorRequests } from "@/db/queries/creator-requests";
import { createMetadataProviderJobContext } from "@/lib/media/metadata-provider-fetch";
import { extractBggCreatorReferences } from "@/lib/media/creators";
import { normalizeBggId } from "@/lib/covers/providers/bgg";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { createJobRun } from "@/db/queries/jobs";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

export type BggCreatorsBackfillPayload = { dryRun: boolean; afterId: number; limit: number; mediaItemId?: number };
export function parseBggCreatorsBackfillPayload(value: unknown): BggCreatorsBackfillPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Параметры должны быть объектом.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["dryRun", "afterId", "limit", "mediaItemId"].includes(key))) throw new Error("Неизвестные параметры.");
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new Error("dryRun должен быть boolean.");
  const afterId = input.afterId ?? 0, limit = input.limit ?? 25;
  if (!Number.isSafeInteger(afterId) || Number(afterId) < 0 || !Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 100
    || (input.mediaItemId !== undefined && (!Number.isSafeInteger(input.mediaItemId) || Number(input.mediaItemId) < 1))) throw new Error("Некорректный ID или размер пакета.");
  return { dryRun: input.dryRun === true, afterId: afterId as number, limit: limit as number,
    ...(input.mediaItemId !== undefined ? { mediaItemId: input.mediaItemId as number } : {}) };
}
async function batch(payload: BggCreatorsBackfillPayload) {
  return db.select({ id: mediaItems.id, externalId: mediaItemMetadata.sourceExternalId }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(
      eq(mediaItems.mediaType, "boardgame"), eq(mediaItemMetadata.sourceProvider, "bgg"), gt(mediaItems.id, payload.afterId),
      payload.mediaItemId === undefined ? undefined : eq(mediaItems.id, payload.mediaItemId),
      sql`${mediaItemMetadata.sourceExternalId} is not null`,
    )).orderBy(asc(mediaItems.id)).limit(payload.limit);
}
export const bggCreatorsBackfillHandler: JobHandlerDefinition<BggCreatorsBackfillPayload> = {
  type: "media.bgg-creators-backfill", label: "Создатели настолок из BGG", schedulable: false,
  defaultMaxAttempts: 1, defaultTimeoutSeconds: 900,
  parsePayload(value) {
    try { return parseBggCreatorsBackfillPayload(value); }
    catch (error) { throw new JobError("invalid-payload", error instanceof Error ? error.message : "Некорректные параметры.", { retryable: false }); }
  },
  async execute({ payload, signal, runId, source, jobId, lockToken }) {
    if (source !== "manual" || jobId !== null) throw new JobError("manual-only", "Доступен только разовый запуск из админки.", { retryable: false });
    const jobGuard = lockToken ? { runId, lockToken } : undefined;
    const context = await createMetadataProviderJobContext(0, jobGuard);
    const items = await batch(payload);
    let afterId = payload.afterId, updated = 0, failed = 0;
    for (const item of items) {
      signal.throwIfAborted();
      try {
        const externalId = normalizeBggId(item.externalId ?? "");
        if (!externalId) throw new Error("Некорректный BGG ID записи.");
        let response = await context.fetchTitleMetadata({ provider: "bgg", externalId, mediaType: "boardgame" });
        for (let attempt = 1; attempt < 3 && response.error && ["provider-unavailable", "provider-rate-limit"].includes(response.error); attempt++) {
          await delay(1000, undefined, { signal });
          response = await context.fetchTitleMetadata({ provider: "bgg", externalId, mediaType: "boardgame" });
        }
        signal.throwIfAborted();
        if (response.error || !response.metadata || response.metadata.provider !== "bgg" || response.metadata.externalId !== externalId) throw new Error(response.error ?? "Данные BGG недоступны.");
        const references = extractBggCreatorReferences(response.metadata.facts);
        if (references === null) throw new Error("BGG не вернул полный список ID участников.");
        let syncResult: { createdCreators: number; createdMappings: number; createdLinks: number } | null = null;
        if (!payload.dryRun) syncResult = await withSnapshotJobGuard(jobGuard, async tx => {
          const [entry] = await tx.select().from(mediaItems).where(eq(mediaItems.id, item.id)).for("update");
          const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, item.id));
          if (!entry || entry.mediaType !== "boardgame" || metadata?.sourceProvider !== "bgg" || metadata.sourceExternalId !== item.externalId) throw new Error("Источник записи изменился во время загрузки.");
          // Merge only technical creator references. Titles, covers and editable facts stay intact.
          const facts = { ...metadata.facts, bggCreators: response.metadata!.facts.bggCreators };
          await tx.update(mediaItemMetadata).set({ facts, updatedAt: new Date() }).where(eq(mediaItemMetadata.mediaItemId, item.id));
          return syncProviderCreators(tx, { mediaItemId: item.id, provider: "bgg", mediaType: "boardgame", facts });
        });
        const approval = payload.dryRun ? null : await autoApproveBggCreatorRequests(item.id, jobGuard);
        updated++;
        await logSystemActivity({ jobGuard, action: "media.bgg-creators-backfill.progress", entityType: "job-run", entityId: runId,
          message: `Запись #${item.id}: ${payload.dryRun ? "проверена" : "обновлена"}, участников/ролей — ${references.length}.`, metadata: { mediaItemId: item.id, afterId: item.id, dryRun: payload.dryRun, references, syncResult, approval } });
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof Error && "code" in error && error.code === "lease-lost") throw error;
        failed++;
        await logSystemActivity({ jobGuard, action: "media.bgg-creators-backfill.progress", entityType: "job-run", entityId: runId, severity: "warning", status: "failure",
          message: `Запись #${item.id}: ${error instanceof Error ? error.message : "Не удалось загрузить участников."}`, metadata: { mediaItemId: item.id, afterId: item.id, dryRun: payload.dryRun } });
      }
      afterId = item.id;
    }
    const more = (await batch({ ...payload, afterId, limit: 1 })).length > 0;
    await logSystemActivity({ jobGuard, action: "media.bgg-creators-backfill.completed", entityType: "job-run", entityId: runId,
      message: `Участники BGG: обработано ${items.length}, успешно ${updated}, ошибок ${failed}${more ? "; будет продолжение" : "; обход завершён"}.`, metadata: { dryRun: payload.dryRun, afterId, updated, failed, hasMore: more } });
    signal.throwIfAborted();
    if (more) await withSnapshotJobGuard(jobGuard, tx => createJobRun({ type: "media.bgg-creators-backfill", payload: { ...payload, afterId }, source: "manual", maxAttempts: 1, timeoutSeconds: 900, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx));
  },
};
