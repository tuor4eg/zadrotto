import "server-only"

import { getMediaItemsMissingMetadata } from "@/db/queries/media-item-metadata"
import { createMetadataJobStore } from "@/lib/media/metadata-job-store"
import { createMetadataProviderJobContext } from "@/lib/media/metadata-provider-fetch"
import { runMetadataBackfill, type MetadataJobResult } from "@/lib/media/metadata-jobs"

export type MetadataBackfillPayload = {
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
}

export async function backfillMediaMetadata(input: {
  attempt?: number
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  runId?: number
} = {}): Promise<MetadataJobResult> {
  const items = await getMediaItemsMissingMetadata({
    limit: input.mediaItemId ? 1 : input.limit ?? 25,
    mediaItemId: input.mediaItemId,
  })
  if (items.length === 0) {
    return { failed: 0, retryableFailed: 0, skipped: 0, updated: 0 }
  }

  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100)
  return runMetadataBackfill({
    context,
    items,
    store: createMetadataJobStore({
      attempt: input.attempt ?? 1,
      runId: input.runId ?? null,
    }),
  })
}
