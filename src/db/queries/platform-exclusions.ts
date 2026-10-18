import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { containsNormalizedSearchSql } from "@/db/search";
import { adminActivityLogs, platformRequests, jobRuns, mediaTypes, providerPlatformExclusions } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";

export async function getPlatformExclusionsPage(input: { searchQuery: string; page: number }) {
  const search = normalizeSearchText(input.searchQuery);
  const filter = search ? or(containsNormalizedSearchSql(providerPlatformExclusions.externalPlatformName, search),
    containsNormalizedSearchSql(providerPlatformExclusions.provider, search)) : undefined;
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(providerPlatformExclusions).where(filter);
  const totalPages = Math.max(1, Math.ceil(count.total / 25));
  const page = Math.min(totalPages, Number.isSafeInteger(input.page) && input.page > 0 ? input.page : 1);
  const items = await db.select({ id: providerPlatformExclusions.id, provider: providerPlatformExclusions.provider,
    name: providerPlatformExclusions.externalPlatformName, mediaTypeName: mediaTypes.name,
    applying: sql<boolean>`exists (select 1 from ${platformRequests} left join ${jobRuns} on ${jobRuns.id} = ${platformRequests.jobRunId}
      where ${platformRequests.provider} = ${providerPlatformExclusions.provider}
      and ${platformRequests.mediaType} = ${providerPlatformExclusions.mediaType}
      and ${platformRequests.normalizedExternalPlatformName} = ${providerPlatformExclusions.normalizedExternalPlatformName}
      and (${jobRuns.status} in ('queued', 'running') or (${platformRequests.jobRunId} is null and ${platformRequests.applyStatus} = 'applying')))`,
  }).from(providerPlatformExclusions).innerJoin(mediaTypes, eq(mediaTypes.code, providerPlatformExclusions.mediaType))
    .where(filter).orderBy(asc(providerPlatformExclusions.externalPlatformName), asc(providerPlatformExclusions.id))
    .limit(25).offset((page - 1) * 25);
  return { items, total: count.total, page, totalPages };
}

export async function restorePlatformExclusion(id: number, adminId: number) {
  return db.transaction(async (tx) => {
    const [exclusion] = await tx.select().from(providerPlatformExclusions).where(eq(providerPlatformExclusions.id, id));
    if (!exclusion) throw new Error("not-found");
    const key = and(eq(platformRequests.provider, exclusion.provider), eq(platformRequests.mediaType, exclusion.mediaType),
      eq(platformRequests.normalizedExternalPlatformName, exclusion.normalizedExternalPlatformName));
    await tx.insert(platformRequests).values({ provider: exclusion.provider, mediaType: exclusion.mediaType,
      externalPlatformName: exclusion.externalPlatformName, normalizedExternalPlatformName: exclusion.normalizedExternalPlatformName }).onConflictDoNothing();
    // Match the request lock used by decisions and metadata imports before changing the exclusion.
    const [request] = await tx.select().from(platformRequests).where(key).for("update");
    const [run] = request.jobRunId === null ? [] : await tx.select().from(jobRuns).where(eq(jobRuns.id, request.jobRunId)).for("update");
    if (run ? ["queued", "running"].includes(run.status) : request.applyStatus === "applying") throw new Error("applying");
    const removed = await tx.delete(providerPlatformExclusions).where(eq(providerPlatformExclusions.id, id)).returning({ id: providerPlatformExclusions.id });
    if (!removed.length || (request.decision !== null && request.decision !== "exclude")) throw new Error("changed");
    await tx.update(platformRequests).set({ decision: null, resolvedAt: null, resolvedByAdminId: null,
      jobRunId: null, applyStatus: "pending", jobError: null, updatedAt: new Date() }).where(eq(platformRequests.id, request.id));
    await tx.insert(adminActivityLogs).values({ action: "platform-exclusion.restored", actorType: "admin", adminUserId: adminId,
      entityType: "platform-request", entityId: request.id, entityLabel: exclusion.externalPlatformName,
      status: "success", severity: "info", message: "Отменённое значение возвращено в заявки на платформы." });
    return request.id;
  });
}
