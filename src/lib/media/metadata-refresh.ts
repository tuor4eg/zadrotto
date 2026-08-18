import "server-only"

import { getMediaItemsStaleMetadata } from "@/db/queries/media-item-metadata"
import { createMetadataJobStore } from "@/lib/media/metadata-job-store"
import { createMetadataProviderJobContext } from "@/lib/media/metadata-provider-fetch"
import { runMetadataRefresh, type MetadataJobResult } from "@/lib/media/metadata-jobs"

export type MetadataRefreshPayload = {
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  staleDays?: number
}

export async function refreshStaleMediaMetadata(input: {
  attempt?: number
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  runId?: number
  staleDays?: number
} = {}): Promise<MetadataJobResult> {
  const items = await getMediaItemsStaleMetadata({
    limit: input.mediaItemId ? 1 : input.limit ?? 20,
    mediaItemId: input.mediaItemId,
    staleDays: input.staleDays ?? 90,
  })
  if (items.length === 0) {
    return { failed: 0, retryableFailed: 0, skipped: 0, updated: 0 }
  }

  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100)
  return runMetadataRefresh({
    context,
    items,
    store: createMetadataJobStore({
      attempt: input.attempt ?? 1,
      runId: input.runId ?? null,
    }),
  })
}
