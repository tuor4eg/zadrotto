import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { containsNormalizedSearchSql } from "@/db/search";
import { adminActivityLogs, genreRequests, jobRuns, mediaTypes, providerGenreExclusions } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";

export async function getGenreExclusionsPage(input: { searchQuery: string; page: number }) {
  const search = normalizeSearchText(input.searchQuery);
  const filter = search ? or(containsNormalizedSearchSql(providerGenreExclusions.externalGenreName, search),
    containsNormalizedSearchSql(providerGenreExclusions.provider, search)) : undefined;
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(providerGenreExclusions).where(filter);
  const totalPages = Math.max(1, Math.ceil(count.total / 25));
  const page = Math.min(totalPages, Number.isSafeInteger(input.page) && input.page > 0 ? input.page : 1);
  const items = await db.select({ id: providerGenreExclusions.id, provider: providerGenreExclusions.provider,
    name: providerGenreExclusions.externalGenreName, mediaTypeName: mediaTypes.name,
    applying: sql<boolean>`exists (select 1 from ${genreRequests} left join ${jobRuns} on ${jobRuns.id} = ${genreRequests.jobRunId}
      where ${genreRequests.provider} = ${providerGenreExclusions.provider}
      and ${genreRequests.mediaType} = ${providerGenreExclusions.mediaType}
      and ${genreRequests.normalizedExternalGenreName} = ${providerGenreExclusions.normalizedExternalGenreName}
      and (${jobRuns.status} in ('queued', 'running') or (${genreRequests.jobRunId} is null and ${genreRequests.applyStatus} = 'applying')))`,
  }).from(providerGenreExclusions).innerJoin(mediaTypes, eq(mediaTypes.code, providerGenreExclusions.mediaType))
    .where(filter).orderBy(asc(providerGenreExclusions.externalGenreName), asc(providerGenreExclusions.id))
    .limit(25).offset((page - 1) * 25);
  return { items, total: count.total, page, totalPages };
}

export async function restoreGenreExclusion(id: number, adminId: number) {
  return db.transaction(async (tx) => {
    const [exclusion] = await tx.select().from(providerGenreExclusions).where(eq(providerGenreExclusions.id, id));
    if (!exclusion) throw new Error("not-found");
    const key = and(eq(genreRequests.provider, exclusion.provider), eq(genreRequests.mediaType, exclusion.mediaType),
      eq(genreRequests.normalizedExternalGenreName, exclusion.normalizedExternalGenreName));
    await tx.insert(genreRequests).values({ provider: exclusion.provider, mediaType: exclusion.mediaType,
      externalGenreName: exclusion.externalGenreName, normalizedExternalGenreName: exclusion.normalizedExternalGenreName }).onConflictDoNothing();
    // Match the request lock used by decisions and metadata imports before changing the exclusion.
    const [request] = await tx.select().from(genreRequests).where(key).for("update");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId)).for("update");
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying") throw new Error("applying");
    const removed = await tx.delete(providerGenreExclusions).where(eq(providerGenreExclusions.id, id)).returning({ id: providerGenreExclusions.id });
    if (!removed.length || (request.decision !== null && request.decision !== "exclude")) throw new Error("changed");
    await tx.update(genreRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null,
      jobRunId: null, applyStatus: "pending", jobError: null, updatedAt: new Date() }).where(eq(genreRequests.id, request.id));
    await tx.insert(adminActivityLogs).values({ action: "genre-exclusion.restored", actorType: "admin", adminUserId: adminId,
      entityType: "genre-request", entityId: request.id, entityLabel: exclusion.externalGenreName,
      status: "success", severity: "info", message: "Отменённое значение возвращено в заявки на жанры." });
    return request.id;
  });
}
