import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { createJobRun } from "@/db/queries/jobs";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { containsNormalizedSearchSql } from "@/db/search";
import { normalizeSearchText } from "@/lib/search/normalize";
import { adminActivityLogs, platforms, platformRequests, platformRequestMediaItems, jobRuns, mediaItemPlatforms, mediaItemMetadata, mediaItems, mediaTypes, providerPlatformExclusions, providerPlatformMappings } from "@/db/schema";
import { extractExternalPlatforms, type ExternalPlatform } from "@/lib/media/platforms";
import { resolveProviderPlatforms, syncMediaItemProviderPlatforms, type PlatformTransaction } from "@/db/queries/media-item-platforms";

export const PLATFORM_REQUEST_JOB_TYPE = "media.platform-request-apply";
export class PlatformRequestError extends Error {
  constructor(public readonly code: "already-resolved" | "not-found" | "invalid-name" | "invalid-platforms" | "not-retryable" | "applying" | "changed", message: string) {
    super(message);
    this.name = "PlatformRequestError";
  }
}

export type PlatformRequestDecision = "map" | "create" | "exclude";
export type PlatformRequestStatus = "pending" | "applying" | "processed" | "failed";

const statusSql = sql<PlatformRequestStatus>`case
  when ${jobRuns.status} in ('queued', 'running') then 'applying'
  when ${jobRuns.status} = 'succeeded' then case when ${platformRequests.decision} is null then 'pending' else 'processed' end
  when ${jobRuns.status} in ('failed', 'cancelled') then 'failed'
  else ${platformRequests.applyStatus} end`;
const requestSelect = {
  id: platformRequests.id, provider: platformRequests.provider, mediaType: platformRequests.mediaType,
  mediaTypeName: mediaTypes.name, externalPlatformName: platformRequests.externalPlatformName,
  normalizedExternalPlatformName: platformRequests.normalizedExternalPlatformName,
  decision: platformRequests.decision, status: statusSql,
  firstSeenAt: platformRequests.firstSeenAt, lastSeenAt: platformRequests.lastSeenAt,
  resolvedAt: platformRequests.resolvedAt, resolvedByAdminId: platformRequests.resolvedByAdminId,
  jobRunId: platformRequests.jobRunId,
  jobError: sql<string | null>`coalesce(${jobRuns.errorMessage}, ${platformRequests.jobError})`,
  occurrenceCount: sql<number>`(select count(*)::int from ${platformRequestMediaItems} occurrence where occurrence.request_id = ${platformRequests.id})`,
};

export async function getPendingPlatformRequestCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(platformRequests).where(isNull(platformRequests.decision));
  return row.count;
}

export async function getPlatformRequests(input: { all?: boolean } = {}) {
  return db.select(requestSelect).from(platformRequests)
    .innerJoin(mediaTypes, eq(mediaTypes.code, platformRequests.mediaType))
    .leftJoin(jobRuns, eq(jobRuns.id, platformRequests.jobRunId))
    .where(input.all ? undefined : isNull(platformRequests.decision))
    .orderBy(asc(platformRequests.firstSeenAt), asc(platformRequests.id));
}

export async function getPlatformRequestsPage(input: { all?: boolean; searchQuery?: string; page?: number } = {}) {
  const search = normalizeSearchText(input.searchQuery ?? "");
  const filter = and(input.all ? undefined : isNull(platformRequests.decision),
    search ? containsNormalizedSearchSql(platformRequests.externalPlatformName, search) : undefined);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(platformRequests).where(filter);
  const totalPages = Math.max(1, Math.ceil(count.total / 25));
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, totalPages) : 1;
  const items = await db.select(requestSelect).from(platformRequests)
    .innerJoin(mediaTypes, eq(mediaTypes.code, platformRequests.mediaType))
    .leftJoin(jobRuns, eq(jobRuns.id, platformRequests.jobRunId)).where(filter)
    .orderBy(asc(platformRequests.firstSeenAt), asc(platformRequests.id)).limit(25).offset((page - 1) * 25);
  return { items, total: count.total, totalPages, page };
}

export type PlatformRequestListItem = Awaited<ReturnType<typeof getPlatformRequests>>[number];

export async function getPlatformRequestDetail(id: number, input: { page?: number } = {}) {
  const [request] = await db.select(requestSelect).from(platformRequests)
    .innerJoin(mediaTypes, eq(mediaTypes.code, platformRequests.mediaType))
    .leftJoin(jobRuns, eq(jobRuns.id, platformRequests.jobRunId)).where(eq(platformRequests.id, id));
  if (!request) return null;
  const totalPages = Math.max(1, Math.ceil(request.occurrenceCount / 20));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(input.page || 1)));
  const [variants, items, selectedPlatforms] = await Promise.all([
    db.select({ name: platformRequestMediaItems.externalPlatformName,
      count: sql<number>`count(*)::int` }).from(platformRequestMediaItems)
      .where(eq(platformRequestMediaItems.requestId, id))
      .groupBy(platformRequestMediaItems.externalPlatformName)
      .orderBy(asc(platformRequestMediaItems.externalPlatformName)),
    db.select({ id: mediaItems.id, code: mediaItems.code, title: mediaItems.title })
      .from(platformRequestMediaItems).innerJoin(mediaItems, eq(mediaItems.id, platformRequestMediaItems.mediaItemId))
      .where(eq(platformRequestMediaItems.requestId, id)).orderBy(asc(mediaItems.id)).limit(20).offset((page - 1) * 20),
    db.selectDistinct({ id: platforms.id, slug: platforms.slug, name: platforms.name }).from(providerPlatformMappings)
      .innerJoin(platforms, eq(platforms.id, providerPlatformMappings.platformId))
      .where(and(eq(providerPlatformMappings.provider, request.provider), eq(providerPlatformMappings.mediaType, request.mediaType),
        eq(providerPlatformMappings.normalizedExternalPlatformName, request.normalizedExternalPlatformName)))
      .orderBy(asc(platforms.slug)),
  ]);
  return { request, variants, items, platforms: selectedPlatforms, page, totalPages };
}

/** Lock all request keys in a stable order after locking the media item. Decisions never lock media items. */
export async function lockPlatformRequestsForMetadata(tx: PlatformTransaction, input: {
  mediaItemId: number; provider: string | null; mediaType: string; facts: Record<string, unknown>;
}) {
  if (!input.provider || input.mediaType !== "game") return;
  const external = extractExternalPlatforms(input.facts);
  const resolved = await resolveProviderPlatforms(input, tx);
  const unknown = new Set(resolved.unmapped.map((platform) => platform.normalizedName));
  for (const platform of [...external].sort((a, b) => a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0)) {
    if (unknown.has(platform.normalizedName)) {
      const [created] = await tx.insert(platformRequests).values({ provider: input.provider, mediaType: input.mediaType,
        externalPlatformName: platform.name, normalizedExternalPlatformName: platform.normalizedName }).onConflictDoNothing().returning({ id: platformRequests.id });
      if (created) {
        const event = await appendDomainEvent(tx, { type: "platform-request.created", actorAuthorId: null,
          aggregateType: "platform-request", aggregateId: String(created.id), payload: { requestId: created.id } });
        // The job and outbox become visible together after the provider transaction commits.
        await createJobRun({ type: "domain-events.dispatch", payload: { eventId: event.id }, source: "event",
          maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
      }
      if (created) await tx.insert(adminActivityLogs).values({ action: "platform-request.detected", actorType: "system",
        entityType: "platform-request", entityId: created.id, entityLabel: platform.name, status: "success", severity: "warning",
        message: "Обнаружена неизвестная платформа записи.", metadata: { mediaItemId: input.mediaItemId, provider: input.provider, mediaType: input.mediaType, externalName: platform.name, reason: "unmapped-value" } });
    }
    await tx.select({ id: platformRequests.id }).from(platformRequests)
      .where(and(eq(platformRequests.provider, input.provider), eq(platformRequests.mediaType, input.mediaType),
        eq(platformRequests.normalizedExternalPlatformName, platform.normalizedName))).for("update");
  }
}

/** Caller owns media-item and request locks. Track current occurrences, including resolved requests. */
export async function syncPlatformRequestOccurrences(tx: PlatformTransaction, input: {
  mediaItemId: number; provider: string | null; mediaType: string; externalPlatforms: readonly ExternalPlatform[];
}) {
  const rows = input.mediaType === "game" && input.provider && input.externalPlatforms.length ? await tx.select().from(platformRequests)
    .where(and(eq(platformRequests.provider, input.provider), eq(platformRequests.mediaType, input.mediaType),
      inArray(platformRequests.normalizedExternalPlatformName, input.externalPlatforms.map((platform) => platform.normalizedName)))) : [];
  const now = new Date();
  // Delete/reinsert inside the existing transaction; request/media uniqueness prevents duplicates.
  await tx.delete(platformRequestMediaItems).where(eq(platformRequestMediaItems.mediaItemId, input.mediaItemId));
  for (const request of rows) {
    const platform = input.externalPlatforms.find((platform) => platform.normalizedName === request.normalizedExternalPlatformName)!;
    await tx.insert(platformRequestMediaItems).values({ requestId: request.id, mediaItemId: input.mediaItemId,
      externalPlatformName: platform.name });
    await tx.update(platformRequests).set({ lastSeenAt: now, updatedAt: now }).where(eq(platformRequests.id, request.id));
  }
}

async function enqueueApply(tx: PlatformTransaction, requestId: number, adminId: number) {
  const now = new Date();
  const [run] = await tx.insert(jobRuns).values({ type: PLATFORM_REQUEST_JOB_TYPE, payload: { requestId }, source: "manual",
    createdByAdminId: adminId, scheduledFor: now, availableAt: now,
    maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }).returning({ id: jobRuns.id });
  await tx.update(platformRequests).set({ jobRunId: run.id, applyStatus: "applying", jobError: null, updatedAt: now })
    .where(eq(platformRequests.id, requestId));
  return { requestId, jobRunId: run.id };
}

export async function resolvePlatformRequest(input: {
  requestId: number; adminId: number; decision: PlatformRequestDecision; platformIds?: number[]; name?: string;
}) {
  if (!["map", "create", "exclude"].includes(input.decision)) throw new Error("Неизвестное решение заявки.");
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(platformRequests).where(eq(platformRequests.id, input.requestId)).for("update");
    if (!request) throw new PlatformRequestError("not-found", "Заявка не найдена.");
    if (request.decision !== null) throw new PlatformRequestError("already-resolved", "Решение по заявке уже принято.");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? run.status !== "succeeded" : request.applyStatus !== "pending") {
      throw new PlatformRequestError("applying", "Сначала завершите пересчёт платформ записей.");
    }
    const now = new Date();
    let platformIds: number[] = [];
    if (input.decision === "create") {
      const name = input.name?.trim();
      if (!name) throw new PlatformRequestError("invalid-name", "Укажите название платформы.");
      const [next] = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('platforms', 'id'))::int as id`);
      const slug = `custom-${next.id}`;
      const [platform] = await tx.insert(platforms).values({ id: next.id, name, slug }).returning({ id: platforms.id });
      platformIds = [platform.id];
    } else if (input.decision === "map") {
      platformIds = [...new Set(input.platformIds ?? [])];
      if (!platformIds.length || platformIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647)) {
        throw new PlatformRequestError("invalid-platforms", "Выберите хотя бы одну платформу.");
      }
      const selected = await tx.select().from(platforms).where(inArray(platforms.id, platformIds)).for("share");
      if (selected.length !== platformIds.length || selected.some((platform) => !platform.isActive)) {
        throw new PlatformRequestError("invalid-platforms", "Выберите активные платформы.");
      }
    }
    if (input.decision === "exclude") {
      await tx.insert(providerPlatformExclusions).values({ provider: request.provider, mediaType: request.mediaType,
        externalPlatformName: request.externalPlatformName, normalizedExternalPlatformName: request.normalizedExternalPlatformName })
        .onConflictDoNothing();
    } else {
      await tx.insert(providerPlatformMappings).values(platformIds.map((platformId) => ({ provider: request.provider,
        mediaType: request.mediaType, externalPlatformName: request.externalPlatformName,
        normalizedExternalPlatformName: request.normalizedExternalPlatformName, platformId }))).onConflictDoNothing();
    }
    await tx.update(platformRequests).set({ decision: input.decision, resolvedByAdminId: input.adminId,
      resolvedAt: now, applyStatus: "applying", updatedAt: now }).where(eq(platformRequests.id, input.requestId));
    const queued = await enqueueApply(tx, input.requestId, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "platform-request.resolved", actorType: "admin", adminUserId: input.adminId,
      entityType: "platform-request", entityId: input.requestId, entityLabel: request.externalPlatformName, status: "success", severity: "info",
      message: "Принято решение по заявке на платформу.", metadata: { decision: input.decision, jobRunId: queued.jobRunId } });
    return queued;
  });
  return result;
}

/** Request locks precede mapping changes; do not lock media items in this transaction. */
export async function reopenPlatformMapping(input: { mappingId: number; adminId: number }) {
  return db.transaction(async (tx) => {
    const [mapping] = await tx.select().from(providerPlatformMappings).where(eq(providerPlatformMappings.id, input.mappingId));
    if (!mapping) throw new PlatformRequestError("not-found", "Соответствие платформы не найдено.");
    const key = and(eq(platformRequests.provider, mapping.provider), eq(platformRequests.mediaType, mapping.mediaType),
      eq(platformRequests.normalizedExternalPlatformName, mapping.normalizedExternalPlatformName));
    await tx.insert(platformRequests).values({ provider: mapping.provider, mediaType: mapping.mediaType,
      externalPlatformName: mapping.externalPlatformName, normalizedExternalPlatformName: mapping.normalizedExternalPlatformName }).onConflictDoNothing();
    const [request] = await tx.select().from(platformRequests).where(key).for("update");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying") {
      throw new PlatformRequestError("applying", "Дождитесь завершения текущей задачи.");
    }
    const mappings = await tx.select().from(providerPlatformMappings).where(and(
      eq(providerPlatformMappings.provider, mapping.provider), eq(providerPlatformMappings.mediaType, mapping.mediaType),
      eq(providerPlatformMappings.normalizedExternalPlatformName, mapping.normalizedExternalPlatformName)));
    if (!mappings.some((row) => row.id === input.mappingId) || request.decision === "exclude") {
      throw new PlatformRequestError("changed", "Соответствие уже изменено.");
    }
    // Serialize removal of different provider variants of the same platform, and
    // prevent a new mapping from being added between the orphan check and deletion.
    const affectedPlatformIds = [...new Set(mappings.map((row) => row.platformId))];
    await tx.select({ id: platforms.id }).from(platforms).where(inArray(platforms.id, affectedPlatformIds))
      .orderBy(asc(platforms.id)).for("update");
    // Discovery belongs to the worker: inserting occurrences here would take FK media-item
    // locks after the request lock, reversing the metadata import lock order.
    await tx.delete(providerPlatformMappings).where(inArray(providerPlatformMappings.id, mappings.map((row) => row.id)));
    const orphanPlatforms = await tx.select({ id: platforms.id }).from(platforms).where(and(
      inArray(platforms.id, affectedPlatformIds),
      sql`not exists (select 1 from ${providerPlatformMappings} where ${providerPlatformMappings.platformId} = ${platforms.id})`,
    ));
    const deletedPlatformIds = orphanPlatforms.map((platform) => platform.id);
    if (deletedPlatformIds.length > 0) {
      // Deleting outgoing links takes no FK locks on media items, preserving
      // the media → request lock order used by provider imports.
      await tx.delete(mediaItemPlatforms).where(inArray(mediaItemPlatforms.platformId, deletedPlatformIds));
      await tx.delete(platforms).where(inArray(platforms.id, deletedPlatformIds));
    }
    await tx.update(platformRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null,
      applyStatus: "applying", jobError: null, updatedAt: new Date() }).where(eq(platformRequests.id, request.id));
    const queued = await enqueueApply(tx, request.id, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "platform-mapping.reopened", actorType: "admin", adminUserId: input.adminId,
      entityType: "platform-request", entityId: request.id, entityLabel: mapping.externalPlatformName, status: "success", severity: "info",
      message: "Вариант провайдера возвращён в заявки на платформы. Пересчёт записей поставлен в очередь.",
      metadata: { platformIds: affectedPlatformIds, deletedPlatformIds, jobRunId: queued.jobRunId } });
    return queued;
  });
}

export async function retryPlatformRequest(input: { requestId: number; adminId: number }) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(platformRequests).where(eq(platformRequests.id, input.requestId)).for("update");
    if (!request) throw new PlatformRequestError("not-found", "Заявка не найдена.");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? !["failed", "cancelled"].includes(run.status) : request.applyStatus !== "failed") {
      throw new PlatformRequestError("not-retryable", "Повтор доступен только после ошибки или отмены задачи.");
    }
    const queued = await enqueueApply(tx, input.requestId, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "platform-request.retry-requested", actorType: "admin", adminUserId: input.adminId,
      entityType: "platform-request", entityId: input.requestId, entityLabel: request.externalPlatformName, status: "success", severity: "info",
      message: "Запрошено повторное применение решения по платформе.", metadata: { jobRunId: queued.jobRunId } });
    return queued;
  });
}

export async function applyPlatformRequest(requestId: number, input: { signal?: AbortSignal; jobRunId?: number } = {}) {
  const [request] = await db.select().from(platformRequests).where(eq(platformRequests.id, requestId));
  if (!request) throw new Error("Platform request not found");
  if (input.jobRunId && request.jobRunId !== input.jobRunId) return { processed: 0 };
  // A worker can retry after committing the recalculation but before recording job success.
  if (request.decision === null && request.applyStatus === "pending") {
    if (input.jobRunId) return { processed: 0 };
    throw new Error("Platform request has no operation");
  }
  let afterId = 0;
  let processed = 0;
  try {
    for (;;) {
      input.signal?.throwIfAborted();
      const occurrences = request.decision === null
        ? await db.select({ mediaItemId: mediaItems.id }).from(mediaItems)
          .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
          .where(and(eq(mediaItems.mediaType, request.mediaType), eq(mediaItemMetadata.sourceProvider, request.provider), gt(mediaItems.id, afterId)))
          .orderBy(asc(mediaItems.id)).limit(100)
        : await db.select({ mediaItemId: platformRequestMediaItems.mediaItemId }).from(platformRequestMediaItems)
          .where(and(eq(platformRequestMediaItems.requestId, requestId), gt(platformRequestMediaItems.mediaItemId, afterId)))
          .orderBy(asc(platformRequestMediaItems.mediaItemId)).limit(100);
      if (!occurrences.length) break;
      for (const occurrence of occurrences) {
        input.signal?.throwIfAborted();
        await db.transaction(async (tx) => {
          const [item] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems)
            .where(eq(mediaItems.id, occurrence.mediaItemId)).for("update");
          if (!item || item.mediaType !== "game") return;
          const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, occurrence.mediaItemId));
          if (!metadata) {
            await tx.delete(platformRequestMediaItems).where(eq(platformRequestMediaItems.mediaItemId, occurrence.mediaItemId));
            return;
          }
          if (request.decision === null) {
            if (metadata.sourceProvider !== request.provider || item.mediaType !== request.mediaType) return;
            // Recalculate all current records of this provider/type. This also covers ID aliases
            // after a failed job's history has been deleted, without persisting a second rollback state.
            try { extractExternalPlatforms(metadata.facts); } catch { return; }
          }
          // Legacy metadata without a trustworthy provider is not a successful provider refresh.
          // Keep its existing normalized links; diagnostics remain in the import/migration logs.
          if (!metadata.sourceProvider?.trim()) return;
          await lockPlatformRequestsForMetadata(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider, mediaType: item.mediaType, facts: metadata.facts });
          const resolved = await resolveProviderPlatforms({ provider: metadata.sourceProvider, mediaType: item.mediaType, facts: metadata.facts }, tx);
          await syncMediaItemProviderPlatforms(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider, platforms: resolved.platforms });
          await syncPlatformRequestOccurrences(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider,
            mediaType: item.mediaType, externalPlatforms: extractExternalPlatforms(metadata.facts) });
          input.signal?.throwIfAborted();
        });
        afterId = occurrence.mediaItemId;
        processed++;
      }
    }
    input.signal?.throwIfAborted();
    await db.update(platformRequests).set({ applyStatus: request.decision === null ? "pending" : "processed", jobError: null, updatedAt: new Date() }).where(and(eq(platformRequests.id, requestId), input.jobRunId ? eq(platformRequests.jobRunId, input.jobRunId) : undefined));
    return { processed };
  } catch (error) {
    await db.update(platformRequests).set({ applyStatus: "failed", jobError: "Не удалось применить решение по платформе. Подробности доступны в журнале задачи.",
      updatedAt: new Date() }).where(and(eq(platformRequests.id, requestId), input.jobRunId ? eq(platformRequests.jobRunId, input.jobRunId) : undefined));
    throw error;
  }
}
