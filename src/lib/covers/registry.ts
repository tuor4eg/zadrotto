import { normalizeCoverCandidates } from "@/lib/covers/candidates";
import {
  DEFAULT_COVER_CANDIDATE_LIMIT,
  DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
} from "@/lib/covers/config";
import {
  getCoverProviderDefaultSettings,
  getCoverProviderSettingKey,
} from "@/lib/covers/provider-settings";
import { COVER_PROVIDERS } from "@/lib/covers/providers";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import type {
  CoverProvider,
  CoverProviderCode,
  CoverSearchInput,
  CoverSearchOptions,
} from "@/lib/covers/types";
import type { MediaType } from "@/lib/media-types";

export type CoverProviderRuntimeSetting = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled: boolean;
  priority: number;
};

const DEFAULT_COVER_SEARCH_OPTIONS = {
  candidateLimit: DEFAULT_COVER_CANDIDATE_LIMIT,
  tmdbResultScanLimit: DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
} satisfies CoverSearchOptions;

const DEFAULT_PROVIDER_SETTINGS = getCoverProviderDefaultSettings();

function getProviderSettingsMap(
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  return new Map(providerSettings.map((setting) => [getCoverProviderSettingKey(setting), setting]));
}

export function getConfiguredCoverProviders(
  mediaType: string,
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const settingsByProviderCode = getProviderSettingsMap(providerSettings);

  return providers
    .filter((provider) =>
      provider.mediaTypes.some((providerMediaType) => providerMediaType === mediaType),
    )
    .filter((provider) => {
      const setting = settingsByProviderCode.get(
        getCoverProviderSettingKey({
          mediaType,
          providerCode: provider.code,
        }),
      );

      return setting?.enabled ?? true;
    })
    .map((provider, index) => ({
      provider,
      index,
      priority:
        settingsByProviderCode.get(
          getCoverProviderSettingKey({
            mediaType,
            providerCode: provider.code,
          }),
        )?.priority ?? index + 100,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ provider }) => provider);
}

export function getCoverProvidersForMediaType(
  mediaType: string,
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  return getConfiguredCoverProviders(mediaType, providers, providerSettings);
}

export async function searchCoverCandidates(
  input: CoverSearchInput,
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
  options: CoverSearchOptions = DEFAULT_COVER_SEARCH_OPTIONS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const normalizedTitle = input.title.trim();
  const normalizedOriginalTitle = input.originalTitle?.trim() || null;

  if (!normalizedTitle && !normalizedOriginalTitle) {
    return [];
  }

  const settledResults = await Promise.allSettled(
    getCoverProvidersForMediaType(input.mediaType, providers, providerSettings)
      .filter(
        (provider) =>
          !coverProviderRequiresCredentials(provider.code) ||
          Boolean(options.providerCredentials?.[provider.code]),
      )
      .map((provider) =>
        provider.searchCoverCandidates(
          {
            ...input,
            title: normalizedTitle,
            originalTitle: normalizedOriginalTitle,
          },
          options,
        ),
      ),
  );

  return normalizeCoverCandidates(
    settledResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  ).slice(0, options.candidateLimit);
}
