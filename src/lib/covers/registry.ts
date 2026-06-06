import { normalizeCoverCandidates } from "@/lib/covers/candidates";
import { COVER_PROVIDERS } from "@/lib/covers/providers";
import type { CoverProvider, CoverSearchInput } from "@/lib/covers/types";

export function getCoverProvidersForMediaType(
  mediaType: string,
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
) {
  return providers.filter((provider) =>
    provider.mediaTypes.some((providerMediaType) => providerMediaType === mediaType),
  );
}

export async function searchCoverCandidates(
  input: CoverSearchInput,
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
) {
  const normalizedTitle = input.title.trim();
  const normalizedOriginalTitle = input.originalTitle?.trim() || null;

  if (!normalizedTitle && !normalizedOriginalTitle) {
    return [];
  }

  const settledResults = await Promise.allSettled(
    getCoverProvidersForMediaType(input.mediaType, providers).map((provider) =>
      provider.searchCoverCandidates({
        ...input,
        title: normalizedTitle,
        originalTitle: normalizedOriginalTitle,
      }),
    ),
  );

  return normalizeCoverCandidates(
    settledResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );
}
