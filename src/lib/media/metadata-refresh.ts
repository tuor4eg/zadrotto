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
  signal?: AbortSignal
  attempt?: number
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  lockToken?: string
  runId?: number
  staleDays?: number
} = {}): Promise<MetadataJobResult> {
  input.signal?.throwIfAborted()
  const items = await getMediaItemsStaleMetadata({
    limit: input.mediaItemId ? 1 : input.limit ?? 20,
    mediaItemId: input.mediaItemId,
    staleDays: input.staleDays ?? 90,
  })
  if (items.length === 0) {
    return { failed: 0, retryableFailed: 0, skipped: 0, updated: 0, updatedItems: [] }
  }

  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100, input.runId && input.lockToken ? {runId:input.runId,lockToken:input.lockToken} : undefined, input.signal)
  return runMetadataRefresh({
    context,
    signal: input.signal,
    items,
    store: createMetadataJobStore({
      attempt: input.attempt ?? 1,
      runId: input.runId ?? null,
      lockToken: input.lockToken,
    }),
  })
}
