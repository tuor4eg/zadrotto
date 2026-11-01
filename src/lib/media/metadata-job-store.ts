import "server-only"

import { markMediaItemMetadataAttempt, upsertMediaItemMetadata } from "@/db/queries/media-item-metadata"
import { logSystemActivity } from "@/lib/activity-logs/system"
import type { MetadataJobStore } from "@/lib/media/metadata-jobs"
import { repairAniListCreatorSnapshotLinks } from "@/db/queries/anilist-metadata"

export function createMetadataJobStore(input: {
  attempt: number
  runId: number | null
  lockToken?: string
}): MetadataJobStore {
  return {
    async prepareSource(item, action) {
      if (item.mediaType === "anime" && item.sourceProvider === "anilist" && item.sourceExternalId) {
        try {
          await repairAniListCreatorSnapshotLinks(item.id, item.sourceExternalId, input.runId && input.lockToken ? { runId: input.runId, lockToken: input.lockToken } : undefined)
        } catch (error) {
          const code = error instanceof Error ? error.message : ""
          if (!["AMBIGUOUS_ANILIST_SNAPSHOTS", "INVALID_PROVIDER_SNAPSHOT_REFERENCES", "INVALID_ANILIST_ROSTER", "PROVIDER_SOURCE_CHANGED"].includes(code)) throw error
          await logSystemActivity({ action, entityId: item.id, entityLabel: item.title, message: "Привязка снимка AniList требует проверки.", metadata: { errorCode: code, retryable: false, runId: input.runId }, severity: "warning", status: "failure" })
          return false
        }
      }
      return true
    },
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
    markAttempt: (id,code) => markMediaItemMetadataAttempt(id,code,input.runId && input.lockToken ? {runId:input.runId,lockToken:input.lockToken}:undefined),
    upsert: (value) => upsertMediaItemMetadata({...value,jobGuard:input.runId && input.lockToken ? {runId:input.runId,lockToken:input.lockToken}:undefined}),
  }
}
