import "server-only"

import { getMediaItemsMissingMetadata } from "@/db/queries/media-item-metadata"
import { createMetadataJobStore } from "@/lib/media/metadata-job-store"
import { createMetadataProviderJobContext } from "@/lib/media/metadata-provider-fetch"
import { runMetadataBackfill, type MetadataJobResult } from "@/lib/media/metadata-jobs"

export type MetadataBackfillPayload = {
  force?: boolean
  mediaType?: string
  partsOnly?: boolean
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
}

export async function backfillMediaMetadata(input: {
  attempt?: number
  force?: boolean
  mediaType?: string
  partsOnly?: boolean
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  lockToken?: string
  runId?: number
} = {}): Promise<MetadataJobResult> {
  const items = await getMediaItemsMissingMetadata({
    limit: input.mediaItemId ? 1 : input.limit ?? 25,
    mediaItemId: input.mediaItemId,
    partsOnly: input.partsOnly,
    force: input.force,
    mediaType: input.mediaType,
  })
  if (items.length === 0) {
    return { failed: 0, retryableFailed: 0, skipped: 0, updated: 0, updatedItems: [] }
  }

  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100, input.runId && input.lockToken ? {runId:input.runId,lockToken:input.lockToken} : undefined)
  return runMetadataBackfill({
    context,
    items,
    store: createMetadataJobStore({
      attempt: input.attempt ?? 1,
      runId: input.runId ?? null,
      lockToken: input.lockToken,
    }),
  })
}
