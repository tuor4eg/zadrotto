import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, genres, genreRequests, genreRequestMediaItems, jobRuns, mediaItemMetadata, mediaItems, mediaTypes, providerGenreExclusions, providerGenreMappings } from "@/db/schema";
import { extractExternalGenres, type ExternalGenre } from "@/lib/media/genres";
import { resolveProviderGenres, syncMediaItemProviderGenres, type GenreTransaction } from "@/db/queries/media-item-genres";

export const GENRE_REQUEST_JOB_TYPE = "media.genre-request-apply";
export class GenreRequestError extends Error {
  constructor(public readonly code: "already-resolved" | "not-found" | "invalid-name" | "invalid-genres" | "not-retryable" | "applying" | "changed", message: string) {
    super(message);
    this.name = "GenreRequestError";
  }
}

export type GenreRequestDecision = "map" | "create" | "exclude";
export type GenreRequestStatus = "pending" | "applying" | "processed" | "failed";

const statusSql = sql<GenreRequestStatus>`case
  when ${jobRuns.status} in ('queued', 'running') then 'applying'
  when ${jobRuns.status} = 'succeeded' then case when ${genreRequests.decision} is null then 'pending' else 'processed' end
  when ${jobRuns.status} in ('failed', 'cancelled') then 'failed'
  else ${genreRequests.applyStatus} end`;
const requestSelect = {
  id: genreRequests.id, provider: genreRequests.provider, mediaType: genreRequests.mediaType,
  mediaTypeName: mediaTypes.name, externalGenreName: genreRequests.externalGenreName,
  normalizedExternalGenreName: genreRequests.normalizedExternalGenreName,
  decision: genreRequests.decision, status: statusSql,
  firstSeenAt: genreRequests.firstSeenAt, lastSeenAt: genreRequests.lastSeenAt,
  resolvedAt: genreRequests.resolvedAt, resolvedByAdminId: genreRequests.resolvedByAdminId,
  jobRunId: genreRequests.jobRunId,
  jobError: sql<string | null>`coalesce(${jobRuns.errorMessage}, ${genreRequests.jobError})`,
  occurrenceCount: sql<number>`(select count(*)::int from ${genreRequestMediaItems} occurrence where occurrence.request_id = ${genreRequests.id})`,
};

export async function getPendingGenreRequestCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(genreRequests).where(isNull(genreRequests.decision));
  return row.count;
}

export async function getGenreRequests(input: { all?: boolean } = {}) {
  return db.select(requestSelect).from(genreRequests)
    .innerJoin(mediaTypes, eq(mediaTypes.code, genreRequests.mediaType))
    .leftJoin(jobRuns, eq(jobRuns.id, genreRequests.jobRunId))
    .where(input.all ? undefined : isNull(genreRequests.decision))
    .orderBy(asc(genreRequests.firstSeenAt), asc(genreRequests.id));
}

export type GenreRequestListItem = Awaited<ReturnType<typeof getGenreRequests>>[number];

export async function getGenreRequestDetail(id: number, input: { page?: number } = {}) {
  const [request] = await db.select(requestSelect).from(genreRequests)
    .innerJoin(mediaTypes, eq(mediaTypes.code, genreRequests.mediaType))
    .leftJoin(jobRuns, eq(jobRuns.id, genreRequests.jobRunId)).where(eq(genreRequests.id, id));
  if (!request) return null;
  const totalPages = Math.max(1, Math.ceil(request.occurrenceCount / 20));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(input.page || 1)));
  const [variants, items, selectedGenres] = await Promise.all([
    db.select({ name: genreRequestMediaItems.externalGenreName, externalId: genreRequestMediaItems.externalGenreId,
      count: sql<number>`count(*)::int` }).from(genreRequestMediaItems)
      .where(eq(genreRequestMediaItems.requestId, id))
      .groupBy(genreRequestMediaItems.externalGenreName, genreRequestMediaItems.externalGenreId)
      .orderBy(asc(genreRequestMediaItems.externalGenreName)),
    db.select({ id: mediaItems.id, code: mediaItems.code, title: mediaItems.title })
      .from(genreRequestMediaItems).innerJoin(mediaItems, eq(mediaItems.id, genreRequestMediaItems.mediaItemId))
      .where(eq(genreRequestMediaItems.requestId, id)).orderBy(asc(mediaItems.id)).limit(20).offset((page - 1) * 20),
    db.selectDistinct({ id: genres.id, slug: genres.slug, name: genres.name }).from(providerGenreMappings)
      .innerJoin(genres, eq(genres.id, providerGenreMappings.genreId))
      .where(and(eq(providerGenreMappings.provider, request.provider), eq(providerGenreMappings.mediaType, request.mediaType),
        eq(providerGenreMappings.normalizedExternalGenreName, request.normalizedExternalGenreName)))
      .orderBy(asc(genres.slug)),
  ]);
  return { request, variants, items, genres: selectedGenres, page, totalPages };
}

/** Lock all request keys in a stable order after locking the media item. Decisions never lock media items. */
export async function lockGenreRequestsForMetadata(tx: GenreTransaction, input: {
  mediaItemId: number; provider: string | null; mediaType: string; facts: Record<string, unknown>;
}) {
  if (!input.provider) return;
  const external = extractExternalGenres(input.facts);
  const resolved = await resolveProviderGenres(input, tx);
  const unknown = new Set(resolved.unmapped.map((genre) => genre.normalizedName));
  for (const genre of [...external].sort((a, b) => a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0)) {
    if (unknown.has(genre.normalizedName)) {
      const [created] = await tx.insert(genreRequests).values({ provider: input.provider, mediaType: input.mediaType,
        externalGenreName: genre.name, normalizedExternalGenreName: genre.normalizedName }).onConflictDoNothing().returning({ id: genreRequests.id });
      if (created) await tx.insert(adminActivityLogs).values({ action: "genre-request.detected", actorType: "system",
        entityType: "genre-request", entityId: created.id, entityLabel: genre.name, status: "success", severity: "warning",
        message: "Обнаружен неизвестный жанр записи.", metadata: { mediaItemId: input.mediaItemId, provider: input.provider, mediaType: input.mediaType, externalName: genre.name, externalId: genre.id, reason: "unmapped-value" } });
    }
    await tx.select({ id: genreRequests.id }).from(genreRequests)
      .where(and(eq(genreRequests.provider, input.provider), eq(genreRequests.mediaType, input.mediaType),
        eq(genreRequests.normalizedExternalGenreName, genre.normalizedName))).for("update");
  }
}

/** Caller owns media-item and request locks. Track current occurrences, including resolved requests. */
export async function syncGenreRequestOccurrences(tx: GenreTransaction, input: {
  mediaItemId: number; provider: string | null; mediaType: string; externalGenres: readonly ExternalGenre[];
}) {
  const rows = input.provider && input.externalGenres.length ? await tx.select().from(genreRequests)
    .where(and(eq(genreRequests.provider, input.provider), eq(genreRequests.mediaType, input.mediaType),
      inArray(genreRequests.normalizedExternalGenreName, input.externalGenres.map((genre) => genre.normalizedName)))) : [];
  const now = new Date();
  // Delete/reinsert inside the existing transaction; request/media uniqueness prevents duplicates.
  await tx.delete(genreRequestMediaItems).where(eq(genreRequestMediaItems.mediaItemId, input.mediaItemId));
  for (const request of rows) {
    const genre = input.externalGenres.find((genre) => genre.normalizedName === request.normalizedExternalGenreName)!;
    await tx.insert(genreRequestMediaItems).values({ requestId: request.id, mediaItemId: input.mediaItemId,
      externalGenreName: genre.name, externalGenreId: genre.id });
    await tx.update(genreRequests).set({ lastSeenAt: now, updatedAt: now }).where(eq(genreRequests.id, request.id));
  }
}

async function enqueueApply(tx: GenreTransaction, requestId: number, adminId: number) {
  const now = new Date();
  const [run] = await tx.insert(jobRuns).values({ type: GENRE_REQUEST_JOB_TYPE, payload: { requestId }, source: "manual",
    createdByAdminId: adminId, scheduledFor: now, availableAt: now,
    maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }).returning({ id: jobRuns.id });
  await tx.update(genreRequests).set({ jobRunId: run.id, applyStatus: "applying", jobError: null, updatedAt: now })
    .where(eq(genreRequests.id, requestId));
  return { requestId, jobRunId: run.id };
}

export async function resolveGenreRequest(input: {
  requestId: number; adminId: number; decision: GenreRequestDecision; genreIds?: number[]; name?: string;
}) {
  if (!["map", "create", "exclude"].includes(input.decision)) throw new Error("Неизвестное решение заявки.");
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(genreRequests).where(eq(genreRequests.id, input.requestId)).for("update");
    if (!request) throw new GenreRequestError("not-found", "Заявка не найдена.");
    if (request.decision !== null) throw new GenreRequestError("already-resolved", "Решение по заявке уже принято.");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? run.status !== "succeeded" : request.applyStatus !== "pending") {
      throw new GenreRequestError("applying", "Сначала завершите пересчёт жанров записей.");
    }
    const now = new Date();
    let genreIds: number[] = [];
    if (input.decision === "create") {
      const name = input.name?.trim();
      if (!name) throw new GenreRequestError("invalid-name", "Укажите название жанра.");
      const [next] = await tx.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('genres', 'id'))::int as id`);
      const slug = `${request.mediaType === "game" ? "game-" : ""}custom-${next.id}`;
      const [genre] = await tx.insert(genres).values({ id: next.id, name, slug }).returning({ id: genres.id });
      genreIds = [genre.id];
    } else if (input.decision === "map") {
      genreIds = [...new Set(input.genreIds ?? [])];
      if (!genreIds.length || genreIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647)) {
        throw new GenreRequestError("invalid-genres", "Выберите хотя бы один жанр.");
      }
      const selected = await tx.select().from(genres).where(inArray(genres.id, genreIds)).for("share");
      if (selected.length !== genreIds.length || selected.some((genre) => !genre.isActive)) {
        throw new GenreRequestError("invalid-genres", "Выберите активные жанры.");
      }
    }
    if (input.decision === "exclude") {
      await tx.insert(providerGenreExclusions).values({ provider: request.provider, mediaType: request.mediaType,
        externalGenreName: request.externalGenreName, normalizedExternalGenreName: request.normalizedExternalGenreName })
        .onConflictDoNothing();
    } else {
      await tx.insert(providerGenreMappings).values(genreIds.map((genreId) => ({ provider: request.provider,
        mediaType: request.mediaType, externalGenreName: request.externalGenreName,
        normalizedExternalGenreName: request.normalizedExternalGenreName, genreId }))).onConflictDoNothing();
    }
    await tx.update(genreRequests).set({ decision: input.decision, resolvedByAdminId: input.adminId,
      resolvedAt: now, applyStatus: "applying", updatedAt: now }).where(eq(genreRequests.id, input.requestId));
    const queued = await enqueueApply(tx, input.requestId, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "genre-request.resolved", actorType: "admin", adminUserId: input.adminId,
      entityType: "genre-request", entityId: input.requestId, entityLabel: request.externalGenreName, status: "success", severity: "info",
      message: "Принято решение по заявке на жанр.", metadata: { decision: input.decision, jobRunId: queued.jobRunId } });
    return queued;
  });
  return result;
}

/** Request locks precede mapping changes; do not lock media items in this transaction. */
export async function reopenGenreMapping(input: { mappingId: number; adminId: number }) {
  return db.transaction(async (tx) => {
    const [mapping] = await tx.select().from(providerGenreMappings).where(eq(providerGenreMappings.id, input.mappingId));
    if (!mapping) throw new GenreRequestError("not-found", "Соответствие жанра не найдено.");
    const key = and(eq(genreRequests.provider, mapping.provider), eq(genreRequests.mediaType, mapping.mediaType),
      eq(genreRequests.normalizedExternalGenreName, mapping.normalizedExternalGenreName));
    await tx.insert(genreRequests).values({ provider: mapping.provider, mediaType: mapping.mediaType,
      externalGenreName: mapping.externalGenreName, normalizedExternalGenreName: mapping.normalizedExternalGenreName }).onConflictDoNothing();
    const [request] = await tx.select().from(genreRequests).where(key).for("update");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying") {
      throw new GenreRequestError("applying", "Дождитесь завершения текущей задачи.");
    }
    const mappings = await tx.select().from(providerGenreMappings).where(and(
      eq(providerGenreMappings.provider, mapping.provider), eq(providerGenreMappings.mediaType, mapping.mediaType),
      eq(providerGenreMappings.normalizedExternalGenreName, mapping.normalizedExternalGenreName)));
    if (!mappings.some((row) => row.id === input.mappingId) || request.decision === "exclude") {
      throw new GenreRequestError("changed", "Соответствие уже изменено.");
    }
    // Discovery belongs to the worker: inserting occurrences here would take FK media-item
    // locks after the request lock, reversing the metadata import lock order.
    await tx.delete(providerGenreMappings).where(inArray(providerGenreMappings.id, mappings.map((row) => row.id)));
    await tx.update(genreRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null,
      applyStatus: "applying", jobError: null, updatedAt: new Date() }).where(eq(genreRequests.id, request.id));
    const queued = await enqueueApply(tx, request.id, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "genre-mapping.reopened", actorType: "admin", adminUserId: input.adminId,
      entityType: "genre-request", entityId: request.id, entityLabel: mapping.externalGenreName, status: "success", severity: "info",
      message: "Вариант провайдера возвращён в заявки на жанры. Пересчёт записей поставлен в очередь.",
      metadata: { genreIds: mappings.map((row) => row.genreId), jobRunId: queued.jobRunId } });
    return queued;
  });
}

export async function retryGenreRequest(input: { requestId: number; adminId: number }) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(genreRequests).where(eq(genreRequests.id, input.requestId)).for("update");
    if (!request) throw new GenreRequestError("not-found", "Заявка не найдена.");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId));
    if (run ? !["failed", "cancelled"].includes(run.status) : request.applyStatus !== "failed") {
      throw new GenreRequestError("not-retryable", "Повтор доступен только после ошибки или отмены задачи.");
    }
    const queued = await enqueueApply(tx, input.requestId, input.adminId);
    await tx.insert(adminActivityLogs).values({ action: "genre-request.retry-requested", actorType: "admin", adminUserId: input.adminId,
      entityType: "genre-request", entityId: input.requestId, entityLabel: request.externalGenreName, status: "success", severity: "info",
      message: "Запрошено повторное применение решения по жанру.", metadata: { jobRunId: queued.jobRunId } });
    return queued;
  });
}

export async function applyGenreRequest(requestId: number, input: { signal?: AbortSignal; jobRunId?: number } = {}) {
  const [request] = await db.select().from(genreRequests).where(eq(genreRequests.id, requestId));
  if (!request) throw new Error("Genre request not found");
  if (input.jobRunId && request.jobRunId !== input.jobRunId) return { processed: 0 };
  // A worker can retry after committing the recalculation but before recording job success.
  if (request.decision === null && request.applyStatus === "pending") {
    if (input.jobRunId) return { processed: 0 };
    throw new Error("Genre request has no operation");
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
        : await db.select({ mediaItemId: genreRequestMediaItems.mediaItemId }).from(genreRequestMediaItems)
          .where(and(eq(genreRequestMediaItems.requestId, requestId), gt(genreRequestMediaItems.mediaItemId, afterId)))
          .orderBy(asc(genreRequestMediaItems.mediaItemId)).limit(100);
      if (!occurrences.length) break;
      for (const occurrence of occurrences) {
        input.signal?.throwIfAborted();
        await db.transaction(async (tx) => {
          const [item] = await tx.select({ mediaType: mediaItems.mediaType }).from(mediaItems)
            .where(eq(mediaItems.id, occurrence.mediaItemId)).for("update");
          if (!item) return;
          const [metadata] = await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, occurrence.mediaItemId));
          if (!metadata) {
            await tx.delete(genreRequestMediaItems).where(eq(genreRequestMediaItems.mediaItemId, occurrence.mediaItemId));
            return;
          }
          if (request.decision === null) {
            if (metadata.sourceProvider !== request.provider || item.mediaType !== request.mediaType) return;
            // Recalculate all current records of this provider/type. This also covers ID aliases
            // after a failed job's history has been deleted, without persisting a second rollback state.
            try { extractExternalGenres(metadata.facts); } catch { return; }
          }
          // Legacy metadata without a trustworthy provider is not a successful provider refresh.
          // Keep its existing normalized links; diagnostics remain in the import/migration logs.
          if (!metadata.sourceProvider?.trim()) return;
          await lockGenreRequestsForMetadata(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider, mediaType: item.mediaType, facts: metadata.facts });
          const resolved = await resolveProviderGenres({ provider: metadata.sourceProvider, mediaType: item.mediaType, facts: metadata.facts }, tx);
          await syncMediaItemProviderGenres(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider, genres: resolved.genres });
          await syncGenreRequestOccurrences(tx, { mediaItemId: occurrence.mediaItemId, provider: metadata.sourceProvider,
            mediaType: item.mediaType, externalGenres: extractExternalGenres(metadata.facts) });
          input.signal?.throwIfAborted();
        });
        afterId = occurrence.mediaItemId;
        processed++;
      }
    }
    input.signal?.throwIfAborted();
    await db.update(genreRequests).set({ applyStatus: request.decision === null ? "pending" : "processed", jobError: null, updatedAt: new Date() }).where(and(eq(genreRequests.id, requestId), input.jobRunId ? eq(genreRequests.jobRunId, input.jobRunId) : undefined));
    return { processed };
  } catch (error) {
    await db.update(genreRequests).set({ applyStatus: "failed", jobError: "Не удалось применить решение по жанру. Подробности доступны в журнале задачи.",
      updatedAt: new Date() }).where(and(eq(genreRequests.id, requestId), input.jobRunId ? eq(genreRequests.jobRunId, input.jobRunId) : undefined));
    throw error;
  }
}
