import { backfillAniListCreators } from "./anilist-creators-backfill";
import "server-only"

import { getMediaItemsMissingMetadata } from "@/db/queries/media-item-metadata"
import { createMetadataJobStore } from "@/lib/media/metadata-job-store"
import { createMetadataProviderJobContext } from "@/lib/media/metadata-provider-fetch"
import { runMetadataBackfill, type MetadataJobResult } from "@/lib/media/metadata-jobs"

export type MetadataBackfillPayload = {
  force?: boolean
  mediaType?: string
  creatorsOnly?: boolean
  afterId?: number
  partsOnly?: boolean
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
}

export async function backfillMediaMetadata(input: {
  signal?: AbortSignal
  attempt?: number
  force?: boolean
  mediaType?: string
  creatorsOnly?: boolean
  afterId?: number
  partsOnly?: boolean
  limit?: number
  mediaItemId?: number
  quotaReserve?: number
  lockToken?: string
  runId?: number
} = {}): Promise<MetadataJobResult> {
  input.signal?.throwIfAborted()
  if (input.creatorsOnly) return backfillAniListCreators(input);
  const items = await getMediaItemsMissingMetadata({
    limit: input.mediaItemId ? 1 : input.limit ?? 25,
    mediaItemId: input.mediaItemId,
    partsOnly: input.partsOnly,
    force: input.force,
    mediaType: input.mediaType,
  })
  const includeAnimeCreators = !input.partsOnly && (!input.mediaType || input.mediaType === "anime") && !input.mediaItemId;
  if (items.length === 0) {
    if (includeAnimeCreators) return backfillAniListCreators({...input, creatorsOnly:true});
    return { failed: 0, retryableFailed: 0, skipped: 0, updated: 0, updatedItems: [] }
  }

  const context = await createMetadataProviderJobContext(input.quotaReserve ?? 100, input.runId && input.lockToken ? {runId:input.runId,lockToken:input.lockToken} : undefined, input.signal)
  const result = await runMetadataBackfill({
    context,
    signal: input.signal,
    items,
    store: createMetadataJobStore({
      attempt: input.attempt ?? 1,
      runId: input.runId ?? null,
      lockToken: input.lockToken,
    }),
  })
  if (!includeAnimeCreators || result.retryableFailed || result.stopError) return result;
  const creators = await backfillAniListCreators({...input, creatorsOnly:true});
  return {
    failed:result.failed+creators.failed,retryableFailed:result.retryableFailed+creators.retryableFailed,
    skipped:result.skipped+creators.skipped,updated:result.updated+creators.updated,
    updatedItems:[...result.updatedItems,...creators.updatedItems],...(creators.stopError?{stopError:creators.stopError}:{}),
  };
}
