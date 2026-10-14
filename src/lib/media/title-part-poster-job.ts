import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { titleParts } from "@/db/schema";
import { getTitlePartPosterSource } from "@/db/queries/title-parts-sync";
import { deleteUploadedCoverFilesIfNeeded, uploadTitlePartPoster } from "@/lib/covers/storage";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";

type Payload = { partId: number; imageUrl: string };

export const titlePartPosterHandler: JobHandlerDefinition<Payload> = {
  type: "media.title-part-poster", label: "Загрузка постера части записи", schedulable: false,
  defaultMaxAttempts: 3, defaultTimeoutSeconds: 120,
  parsePayload(value) {
    const input = value as Partial<Payload> | null;
    if (!input || !Number.isSafeInteger(input.partId) || input.partId! <= 0 || typeof input.imageUrl !== "string"
      || !/^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[^?#]+$/i.test(input.imageUrl)
      || Object.keys(input).some((key) => key !== "partId" && key !== "imageUrl")) {
      throw new JobError("invalid-payload", "Некорректный источник постера части.", { retryable: false });
    }
    return { partId: input.partId!, imageUrl: input.imageUrl };
  },
  async execute({ payload }) {
    const previous = await getTitlePartPosterSource(payload.partId, payload.imageUrl);
    if (!previous) return;
    const uploaded = await uploadTitlePartPoster(payload);
    if (!uploaded.ok) throw new JobError(uploaded.error, "Не удалось загрузить постер части.", { retryable: uploaded.error === "cover-upload" });
    if (uploaded.thumbnailError) {
      await deleteUploadedCoverFilesIfNeeded(uploaded);
      throw new JobError(uploaded.thumbnailError, "Не удалось создать миниатюру части.", { retryable: uploaded.thumbnailError === "cover-thumbnail-upload" });
    }
    let installed = false;
    try {
      const rows = await db.update(titleParts).set({ coverUrl: uploaded.coverUrl, coverThumbUrl: uploaded.coverThumbUrl, updatedAt: new Date() })
        .where(and(eq(titleParts.id, payload.partId), eq(titleParts.posterSourceUrl, payload.imageUrl),
          sql`${titleParts.coverUrl} is not distinct from ${previous.coverUrl}`,
          sql`${titleParts.coverThumbUrl} is not distinct from ${previous.coverThumbUrl}`)).returning({ id: titleParts.id });
      installed = rows.length > 0;
    } finally {
      // Every upload has a unique key: an obsolete worker can only delete its own files.
      if (!installed) await deleteUploadedCoverFilesIfNeeded(uploaded);
    }
    if (installed) {
      // A cleanup failure must not rerun the upload and replace the successful poster.
      try { await deleteUploadedCoverFilesIfNeeded(previous); }
      catch (error) { console.error("title part old poster cleanup failed", { partId: payload.partId, error: error instanceof Error ? error.name : "unknown" }); }
    }
  },
};
