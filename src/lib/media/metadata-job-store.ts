import "server-only"

import { markMediaItemMetadataAttempt, upsertMediaItemMetadata } from "@/db/queries/media-item-metadata"
import { logSystemActivity } from "@/lib/activity-logs/system"
import type { MetadataJobStore } from "@/lib/media/metadata-jobs"

export function createMetadataJobStore(input: {
  attempt: number
  runId: number | null
}): MetadataJobStore {
  return {
    async logProviderFailure({ action, error, item }) {
      console.error(
        action === "media.metadata-backfill.failed"
          ? "media metadata backfill failed"
          : "media metadata refresh failed",
        {
          attempt: input.attempt,
          errorCode: error,
          mediaItemId: item.id,
          runId: input.runId,
        },
      )
      await logSystemActivity({
        action,
        entityId: item.id,
        entityLabel: item.title,
        message: action === "media.metadata-backfill.failed"
          ? "Не удалось заполнить метаданные записи."
          : "Не удалось обновить метаданные записи.",
        metadata: {
          attempt: input.attempt,
          errorCode: error,
          retryable: true,
        },
        severity: "warning",
        status: "failure",
      })
    },
    markAttempt: markMediaItemMetadataAttempt,
    upsert: upsertMediaItemMetadata,
  }
}
