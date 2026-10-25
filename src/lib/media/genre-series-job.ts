import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { genres, jobRuns, mediaItems } from "@/db/schema";
import { applyGenreSeriesLinks } from "@/db/queries/genre-series-backfill";
import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

type Payload = { genreId: number; afterId: number; throughId?: number; processed: number; updated: number; applied: number };
export function parseGenreSeriesPayload(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_GENRE_SERIES_PAYLOAD");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["genreId", "afterId", "throughId", "processed", "updated", "applied"].includes(key))) throw new Error("INVALID_GENRE_SERIES_PAYLOAD");
  const n = (key: string, fallback?: number) => {
    const value = row[key] ?? fallback;
    if (!Number.isSafeInteger(value) || Number(value) < (key === "genreId" ? 1 : 0) || Number(value) > 2147483647) throw new Error("INVALID_GENRE_SERIES_PAYLOAD");
    return value as number;
  };
  return { genreId: n("genreId"), afterId: n("afterId", 0), processed: n("processed", 0), updated: n("updated", 0), applied: n("applied", 0), ...(row.throughId !== undefined ? { throughId: n("throughId") } : {}) };
}
export const genreSeriesApplyHandler: JobHandlerDefinition<Payload> = {
  type: "media.genre-series-apply", label: "Применение заменяющей серии жанра", schedulable: false,
  defaultTimeoutSeconds: 300, defaultMaxAttempts: 3, parsePayload: parseGenreSeriesPayload,
  async execute({ payload, runId, lockToken, signal }) {
    if (!lockToken) throw new JobError("lease-lost", "Запуск потерял право выполнения.", { retryable: false });
    const guard = { runId, lockToken };
    const [genre] = await db.select({ id: genres.id, replacement: genres.replacementFranchiseId }).from(genres).where(eq(genres.id, payload.genreId));
    if (!genre?.replacement) throw new JobError("genre-series-missing", "У жанра нет заменяющей серии.", { retryable: false });
    const [run] = await db.select({ payload: jobRuns.payload }).from(jobRuns).where(eq(jobRuns.id, runId));
    let state = parseGenreSeriesPayload(run?.payload ?? payload);
    if (state.throughId === undefined) {
      const [max] = await db.select({ id: sql<number>`coalesce(max(${mediaItems.id}),0)::int` }).from(mediaItems);
      state = { ...state, throughId: max.id };
      await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload: state, updatedAt: new Date() }).where(eq(jobRuns.id, runId)); });
    }
    const result = await applyGenreSeriesLinks({ genreId: state.genreId, afterId: state.afterId, throughId: state.throughId!, limit: 25 }, signal, guard);
    const next = { ...state, afterId: result.lastId ?? state.afterId, processed: state.processed + result.candidateRecords, updated: state.updated + result.updatedRecords, applied: state.applied + result.addedLinks };
    await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload: next, updatedAt: new Date() }).where(eq(jobRuns.id, runId)); });
    if (result.hasMore) throw new JobError("genre-series-continue", "Следующая партия записей жанра.", { deferSeconds: 1 });
  },
};
