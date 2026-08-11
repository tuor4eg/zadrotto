import "server-only";

import {
  getMediaItemsMissingCoverThumb,
  isMediaItemCoverThumbReferenced,
  markMediaItemCoverThumbAttempt,
  updateMediaItemCoverThumb,
} from "@/db/queries/cover-thumbs";
import { logSystemActivity } from "@/lib/activity-logs/system";
import {
  createCoverThumbFromObjectKey,
  deleteUploadedCoverIfNeeded,
} from "./storage";

export type CoverThumbnailBackfillResult = {
  failed: number;
  retryableFailed: number;
  skipped: number;
  updated: number;
};

export async function backfillCoverThumbnails(input: {
  attempt?: number;
  limit?: number;
  mediaItemId?: number;
  runId?: number;
} = {}): Promise<CoverThumbnailBackfillResult> {
  const items = await getMediaItemsMissingCoverThumb({
    limit: input.mediaItemId ? 1 : input.limit ?? 50,
    mediaItemId: input.mediaItemId,
  });
  const result: CoverThumbnailBackfillResult = {
    failed: 0,
    retryableFailed: 0,
    skipped: 0,
    updated: 0,
  };

  for (const item of items) {
    const thumbnail = await createCoverThumbFromObjectKey(item.coverUrl);

    if (!thumbnail.ok) {
      result.failed += 1;
      if (thumbnail.retryable) result.retryableFailed += 1;
      await markMediaItemCoverThumbAttempt({
        mediaItemId: item.id,
        expectedCoverUrl: item.coverUrl!,
      });
      console.error("cover thumbnail backfill failed", {
        attempt: input.attempt ?? 1,
        errorCode: thumbnail.error,
        mediaItemId: item.id,
        runId: input.runId ?? null,
      });
      await logSystemActivity({
        action: "media.cover-thumbnail.failed",
        entityId: item.id,
        entityLabel: item.title,
        message: "Не удалось восстановить миниатюру обложки.",
        metadata: {
          attempt: input.attempt ?? 1,
          errorCode: thumbnail.error,
          retryable: thumbnail.retryable,
          stage: "thumbnail-backfill",
        },
        severity: "warning",
        status: "failure",
      });
      continue;
    }

    const updated = await updateMediaItemCoverThumb({
      mediaItemId: item.id,
      expectedCoverUrl: item.coverUrl!,
      coverThumbUrl: thumbnail.coverThumbUrl,
    });

    if (!updated) {
      result.skipped += 1;
      const isReferenced = await isMediaItemCoverThumbReferenced({
        mediaItemId: item.id,
        coverThumbUrl: thumbnail.coverThumbUrl,
      });

      if (!isReferenced) {
        await deleteUploadedCoverIfNeeded(thumbnail.coverThumbUrl).catch((error) => {
          console.error("stale cover thumbnail cleanup failed", {
            errorName: error instanceof Error ? error.name : typeof error,
            mediaItemId: item.id,
            runId: input.runId ?? null,
          });
        });
      }
      continue;
    }

    result.updated += 1;
    await logSystemActivity({
      action: "media.cover-thumbnail.recovered",
      entityId: item.id,
      entityLabel: item.title,
      message: "Миниатюра обложки восстановлена.",
      metadata: { attempt: input.attempt ?? 1, stage: "thumbnail-backfill" },
    });
  }

  return result;
}
