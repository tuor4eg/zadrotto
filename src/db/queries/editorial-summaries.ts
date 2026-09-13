import { and, asc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { jobRuns, jobs, mediaItemEditorialSummaries, mediaItemMetadata, mediaItems } from "@/db/schema";
import { EDITORIAL_SUMMARY_GENERATE_TYPE, EDITORIAL_SUMMARY_JOB_CODE, getEditorialSummarySourceHash, getGeneratedEditorialSummaryWrite, parseEditorialSummaryOptions, prepareManualEditorialSummary, type EditorialSummarySource } from "@/lib/media/editorial-summary";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

export async function getEditorialSummarySource(mediaItemId: number) {
  const [row] = await db.select({
    id: mediaItems.id,
    title: mediaItems.title,
    originalTitle: mediaItems.originalTitle,
    mediaType: mediaItems.mediaType,
    releaseYear: mediaItems.releaseYear,
    description: mediaItems.description,
    metadataFacts: mediaItemMetadata.facts,
    summary: mediaItemEditorialSummaries.summary,
    sourceHash: mediaItemEditorialSummaries.sourceHash,
    locked: mediaItemEditorialSummaries.locked,
    status: mediaItemEditorialSummaries.status,
  }).from(mediaItems)
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaItemEditorialSummaries, eq(mediaItemEditorialSummaries.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.id, mediaItemId)).limit(1);
  return row ?? null;
}

export async function getEditorialSummary(mediaItemId: number) {
  const [row] = await db.select().from(mediaItemEditorialSummaries)
    .where(eq(mediaItemEditorialSummaries.mediaItemId, mediaItemId)).limit(1);
  return row ?? null;
}

export async function getEditorialSummaryJob() {
  const [row] = await db.select().from(jobs)
    .where(and(eq(jobs.code, EDITORIAL_SUMMARY_JOB_CODE), eq(jobs.type, "media.editorial-summary-sweep")))
    .limit(1);
  return row ?? null;
}

export async function listEditorialSummarySources(afterId: number, limit: number) {
  return db.select({
    id: mediaItems.id,
    title: mediaItems.title,
    originalTitle: mediaItems.originalTitle,
    mediaType: mediaItems.mediaType,
    releaseYear: mediaItems.releaseYear,
    description: mediaItems.description,
    metadataFacts: mediaItemMetadata.facts,
    sourceHash: mediaItemEditorialSummaries.sourceHash,
    locked: mediaItemEditorialSummaries.locked,
  }).from(mediaItems)
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaItemEditorialSummaries, eq(mediaItemEditorialSummaries.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS), gt(mediaItems.id, afterId)))
    .orderBy(asc(mediaItems.id)).limit(limit);
}

export async function countActiveEditorialSummaryRuns() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(jobRuns)
    .where(and(eq(jobRuns.type, EDITORIAL_SUMMARY_GENERATE_TYPE), sql`${jobRuns.status} in ('queued', 'running')`));
  return row?.count ?? 0;
}

export async function enqueueEditorialSummaryRun(input: {
  mediaItemId: number;
  createdByAdminId?: number;
  force?: boolean;
  source: "manual" | "event";
}) {
  const job = await getEditorialSummaryJob();
  if (!job) throw new Error("EDITORIAL_SUMMARY_JOB_MISSING");
  parseEditorialSummaryOptions(job.options);
  const now = new Date();
  const [created] = await db.insert(jobRuns).values({
    jobId: job.id,
    type: EDITORIAL_SUMMARY_GENERATE_TYPE,
    payload: { mediaItemId: input.mediaItemId, ...(input.force ? { force: true } : {}) },
    source: input.source,
    status: "queued",
    createdByAdminId: input.createdByAdminId ?? null,
    scheduledFor: now,
    availableAt: now,
    maxAttempts: job.maxAttempts,
    timeoutSeconds: job.timeoutSeconds,
    retryBaseSeconds: job.retryBaseSeconds,
    retryMaxSeconds: job.retryMaxSeconds,
  }).onConflictDoNothing().returning({ id: jobRuns.id });
  return { created: Boolean(created), runId: created?.id ?? null };
}

export async function saveGeneratedEditorialSummary(input: {
  mediaItemId: number;
  sourceHash: string;
  prompt: string;
  description: string | null;
  modelId: string;
}) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select({
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      description: mediaItems.description,
    }).from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).for("update").limit(1);
    if (!item) return false;
    const [metadata] = await tx.select({ facts: mediaItemMetadata.facts }).from(mediaItemMetadata)
      .where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId)).limit(1);
    const [job] = await tx.select({ options: jobs.options }).from(jobs)
      .where(eq(jobs.code, EDITORIAL_SUMMARY_JOB_CODE)).for("share").limit(1);
    if (!job) return false;
    const prompt = parseEditorialSummaryOptions(job.options).prompt;
    const source: EditorialSummarySource = { ...item, metadataFacts: metadata?.facts ?? null };
    if (prompt !== input.prompt || getEditorialSummarySourceHash(source, prompt) !== input.sourceHash) return false;
    const [current] = await tx.select({
      locked: mediaItemEditorialSummaries.locked,
      summary: mediaItemEditorialSummaries.summary,
      generatedAt: mediaItemEditorialSummaries.generatedAt,
    })
      .from(mediaItemEditorialSummaries)
      .where(eq(mediaItemEditorialSummaries.mediaItemId, input.mediaItemId)).for("update").limit(1);
    if (current?.locked) return false;
    const now = new Date();
    const write = getGeneratedEditorialSummaryWrite({
      description: input.description,
      previousSummary: current?.summary ?? null,
      previousGeneratedAt: current?.generatedAt ?? null,
      now,
    });
    const [saved] = await tx.insert(mediaItemEditorialSummaries).values({
      mediaItemId: input.mediaItemId,
      ...write,
      attemptedAt: now,
      modelId: input.modelId,
      sourceHash: input.sourceHash,
      locked: false,
    }).onConflictDoUpdate({
      target: mediaItemEditorialSummaries.mediaItemId,
      set: {
        ...write,
        attemptedAt: now,
        modelId: input.modelId,
        sourceHash: input.sourceHash,
        updatedAt: now,
      },
      setWhere: eq(mediaItemEditorialSummaries.locked, false),
    }).returning({ mediaItemId: mediaItemEditorialSummaries.mediaItemId });
    return Boolean(saved);
  });
}

export async function saveManualEditorialSummary(mediaItemId: number, summary: string) {
  const now = new Date();
  const value = prepareManualEditorialSummary(summary);
  await db.insert(mediaItemEditorialSummaries).values({
    mediaItemId, ...value,
  }).onConflictDoUpdate({ target: mediaItemEditorialSummaries.mediaItemId, set: {
    ...value, updatedAt: now,
  } });
}

export async function setEditorialSummaryLocked(mediaItemId: number, locked: boolean) {
  await db.update(mediaItemEditorialSummaries).set({ locked, updatedAt: new Date() })
    .where(eq(mediaItemEditorialSummaries.mediaItemId, mediaItemId));
}
