import "server-only"

import {
  getCoverProviderCredentialsForSearch,
  getCoverProviderRateLimits,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings"
import {
  createProviderCoverSearchRateLimiter,
  wrapProviderSearchWithReserve,
} from "@/lib/covers/rate-limits"
import { getTitleMetadata, searchTitleCandidates } from "@/lib/covers/registry"
import type { TitleMetadataInput, TitleSearchInput } from "@/lib/covers/types"
import type { MetadataJobContext } from "@/lib/media/metadata-jobs"

export async function createMetadataProviderJobContext(
  quotaReserve: number,
  snapshotJobGuard?: {runId:number;lockToken:string},
  signal?: AbortSignal,
): Promise<MetadataJobContext> {
  signal?.throwIfAborted()
  const [coverSettings, providerSettings, providerRateLimits, providerCredentials] = await Promise.all([
    getCoverSettings(),
    getCoverProviderSettings(),
    getCoverProviderRateLimits(),
    getCoverProviderCredentialsForSearch(),
  ])
  const limiter = createProviderCoverSearchRateLimiter(providerRateLimits)
  signal?.throwIfAborted()
  const options = {
    signal,
    snapshotJobGuard,
    candidateLimit: coverSettings.candidateLimit,
    tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
    requestTimeoutMs: coverSettings.providerRequestTimeoutMs,
    providerCredentials,
    beforeProviderSearch: wrapProviderSearchWithReserve(
      limiter.canSearchProvider,
      providerRateLimits,
      quotaReserve,
    ),
  }

  return {
    signal,
    fetchTitleMetadata(input: TitleMetadataInput) {
      signal?.throwIfAborted()
      return getTitleMetadata(input, undefined, options, providerSettings)
    },
    searchTitles(input: TitleSearchInput) {
      signal?.throwIfAborted()
      return searchTitleCandidates(input, undefined, options, providerSettings)
    },
  }
}
