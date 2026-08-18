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
): Promise<MetadataJobContext> {
  const [coverSettings, providerSettings, providerRateLimits, providerCredentials] = await Promise.all([
    getCoverSettings(),
    getCoverProviderSettings(),
    getCoverProviderRateLimits(),
    getCoverProviderCredentialsForSearch(),
  ])
  const limiter = createProviderCoverSearchRateLimiter(providerRateLimits)
  const options = {
    candidateLimit: coverSettings.candidateLimit,
    tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
    providerCredentials,
    beforeProviderSearch: wrapProviderSearchWithReserve(
      limiter.canSearchProvider,
      providerRateLimits,
      quotaReserve,
    ),
  }

  return {
    fetchTitleMetadata(input: TitleMetadataInput) {
      return getTitleMetadata(input, undefined, options, providerSettings)
    },
    searchTitles(input: TitleSearchInput) {
      return searchTitleCandidates(input, undefined, options, providerSettings)
    },
  }
}
