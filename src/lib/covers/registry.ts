import { normalizeCoverCandidates } from "@/lib/covers/candidates";
import {
  DEFAULT_COVER_CANDIDATE_LIMIT,
  DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
} from "@/lib/covers/config";
import {
  getCoverProviderDefaultSettings,
  getCoverProviderSettingKey,
  type TitleSearchMode,
} from "@/lib/covers/provider-settings";
import { COVER_PROVIDERS } from "@/lib/covers/providers";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import type {
  CoverCandidate,
  CoverProviderCode,
  CoverSearchInput,
  CoverSearchOptions,
  MediaProvider,
  MediaProviderCode,
  MediaTitleCandidate,
  MediaTitleMetadata,
  TitleSearchInput,
  TitleSearchOptions,
  TitleMetadataInput,
  TitleMetadataOptions,
} from "@/lib/covers/types";
import type { MediaType } from "@/lib/media/types";

export type CoverProviderRuntimeSetting = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled?: boolean;
  titleSearchMode?: TitleSearchMode;
  coverSearchEnabled?: boolean;
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
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const settingsByProviderCode = getProviderSettingsMap(providerSettings);

  return providers
    .filter((provider) =>
      provider.mediaTypes.some((providerMediaType) => providerMediaType === mediaType),
    )
    .filter((provider) => {
      const setting = settingsByProviderCode.get(
        getCoverProviderSettingKey({ mediaType, providerCode: provider.code }),
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
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  return getConfiguredCoverProviders(mediaType, providers, providerSettings).filter(
    (provider) => {
      const setting = getProviderSettingsMap(providerSettings).get(
        getCoverProviderSettingKey({ mediaType, providerCode: provider.code }),
      );

      return Boolean(
        (provider.searchCoverCandidates || provider.getCoverCandidatesByTitleSource) &&
          (setting?.coverSearchEnabled ?? setting?.enabled ?? true),
      );
    },
  );
}

function getConfiguredTitleProvidersForMediaType(
  mediaType: string,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const settings = getProviderSettingsMap(providerSettings);

  return getConfiguredCoverProviders(mediaType, providers, providerSettings)
    .filter((provider) => provider.searchTitleCandidates)
    .map((provider) => ({
      provider,
      mode:
        settings.get(getCoverProviderSettingKey({ mediaType, providerCode: provider.code }))
          ?.titleSearchMode ??
        (settings.get(getCoverProviderSettingKey({ mediaType, providerCode: provider.code }))
          ?.enabled === false
          ? "off"
          : "parallel"),
    }))
    .filter(({ mode }) => mode !== "off");
}

export function getTitleProvidersForMediaType(
  mediaType: string,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  return getConfiguredTitleProvidersForMediaType(
    mediaType,
    providers,
    providerSettings,
  ).map(({ provider }) => provider);
}

export function getMetadataProviderForMediaType(
  mediaType: string,
  providerCode: MediaProviderCode,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const setting = getProviderSettingsMap(providerSettings).get(
    getCoverProviderSettingKey({ mediaType, providerCode }),
  );

  if (setting?.titleSearchMode === "off" || (!setting?.titleSearchMode && setting?.enabled === false)) {
    return undefined;
  }

  return getConfiguredCoverProviders(mediaType, providers, providerSettings).find(
    (provider) => provider.code === providerCode && provider.getTitleMetadata,
  );
}

export async function searchCoverCandidates(
  input: CoverSearchInput,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  options: CoverSearchOptions = DEFAULT_COVER_SEARCH_OPTIONS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  if (input.titleSource) {
    const configuredProviders = getCoverProvidersForMediaType(
      input.mediaType,
      providers,
      providerSettings,
    );
    const provider = configuredProviders.find(
      (candidate) => candidate.code === input.titleSource?.provider,
    );

    const canUseExactProvider = Boolean(
      provider?.getCoverCandidatesByTitleSource &&
        (!coverProviderRequiresCredentials(provider.code) ||
          options.providerCredentials?.[provider.code]),
    );

    if (input.mediaType !== "anime" && (!provider || !canUseExactProvider)) {
      return [];
    }

    const canSearch =
      provider && canUseExactProvider && options.beforeProviderSearch
        ? await options.beforeProviderSearch(provider.code)
        : canUseExactProvider;

    if (input.mediaType !== "anime" && !canSearch) return [];

    let exactCandidates: CoverCandidate[] = [];

    if (provider?.getCoverCandidatesByTitleSource && canSearch) {
      try {
        exactCandidates = normalizeCoverCandidates(
          await provider.getCoverCandidatesByTitleSource(input, options),
        ).slice(0, options.candidateLimit);
      } catch {
        exactCandidates = [];
      }
    }

    if (input.mediaType !== "anime" || exactCandidates.length >= options.candidateLimit) {
      return exactCandidates;
    }

    let candidates = exactCandidates;

    for (const fallbackProvider of configuredProviders) {
      if (
        fallbackProvider.code === input.titleSource.provider ||
        !fallbackProvider.searchCoverCandidates ||
        (coverProviderRequiresCredentials(fallbackProvider.code) &&
          !options.providerCredentials?.[fallbackProvider.code])
      ) {
        continue;
      }

      const canSearchFallback = options.beforeProviderSearch
        ? await options.beforeProviderSearch(fallbackProvider.code)
        : true;

      if (!canSearchFallback) {
        continue;
      }

      try {
        const fallbackCandidates = await fallbackProvider.searchCoverCandidates(
          input,
          {
            ...options,
            candidateLimit: options.candidateLimit - candidates.length,
          },
        );

        candidates = normalizeCoverCandidates([...candidates, ...fallbackCandidates]).slice(
          0,
          options.candidateLimit,
        );
      } catch {
        continue;
      }

      if (candidates.length >= options.candidateLimit) {
        break;
      }
    }

    return candidates;
  }

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
      .map(async (provider) => {
        const searchCoverCandidates = provider.searchCoverCandidates;
        const canSearch = options.beforeProviderSearch
          ? await options.beforeProviderSearch(provider.code)
          : true;

        if (!canSearch || !searchCoverCandidates) {
          return [];
        }

        return searchCoverCandidates(
          {
            ...input,
            title: normalizedTitle,
            originalTitle: normalizedOriginalTitle,
          },
          options,
        );
      }),
  );

  return normalizeCoverCandidates(
    settledResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  ).slice(0, options.candidateLimit);
}

function normalizeTitleCandidates(candidates: MediaTitleCandidate[]) {
  const seen = new Set<string>();
  const normalized: MediaTitleCandidate[] = [];

  for (const candidate of candidates) {
    const title = candidate.title.trim();
    const originalTitle = candidate.originalTitle?.trim() || null;
    const identity = `${candidate.provider}:${candidate.externalId}`;

    if (!title || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    normalized.push({
      ...candidate,
      title,
      originalTitle,
      description: candidate.description?.trim() || null,
    });
  }

  return normalized;
}

export async function searchTitleCandidates(
  input: TitleSearchInput,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  options: TitleSearchOptions = DEFAULT_COVER_SEARCH_OPTIONS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  const configuredProviders = getConfiguredTitleProvidersForMediaType(
    input.mediaType,
    providers,
    providerSettings,
  ).filter(
    ({ provider }) =>
      !coverProviderRequiresCredentials(provider.code) ||
      Boolean(options.providerCredentials?.[provider.code]),
  );
  const parallelResults = await Promise.allSettled(
    configuredProviders
      .filter(({ mode }) => mode === "parallel")
      .filter(
        ({ provider }) =>
          !coverProviderRequiresCredentials(provider.code) ||
          Boolean(options.providerCredentials?.[provider.code]),
      )
      .map(async ({ provider }) => {
        const canSearch = options.beforeProviderSearch
          ? await options.beforeProviderSearch(provider.code)
          : true;

        if (!canSearch || !provider.searchTitleCandidates) {
          return [];
        }

        return provider.searchTitleCandidates({ ...input, query }, options);
      }),
  );

  const parallelCandidates = normalizeTitleCandidates(
    parallelResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );

  if (parallelCandidates.length > 0) {
    return parallelCandidates.slice(0, options.candidateLimit);
  }

  for (const { provider } of configuredProviders.filter(({ mode }) => mode === "fallback")) {
    const canSearch = options.beforeProviderSearch
      ? await options.beforeProviderSearch(provider.code)
      : true;

    if (!canSearch || !provider.searchTitleCandidates) {
      continue;
    }

    try {
      const candidates = normalizeTitleCandidates(
        await provider.searchTitleCandidates({ ...input, query }, options),
      );

      if (candidates.length > 0) {
        return candidates.slice(0, options.candidateLimit);
      }
    } catch {
      continue;
    }
  }

  return [];
}

function normalizeTitleMetadata(metadata: MediaTitleMetadata | null) {
  if (!metadata) {
    return null;
  }

  const facts = Object.fromEntries(
    Object.entries(metadata.facts).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }

      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return true;
    }),
  );

  if (Object.keys(facts).length === 0) {
    return null;
  }

  return {
    ...metadata,
    facts,
  };
}

export async function getTitleMetadata(
  input: TitleMetadataInput,
  providers: readonly MediaProvider[] = COVER_PROVIDERS,
  options: TitleMetadataOptions = DEFAULT_COVER_SEARCH_OPTIONS,
  providerSettings: readonly CoverProviderRuntimeSetting[] = DEFAULT_PROVIDER_SETTINGS,
) {
  const provider = getMetadataProviderForMediaType(
    input.mediaType,
    input.provider,
    providers,
    providerSettings,
  );

  if (
    !provider?.getTitleMetadata ||
    (coverProviderRequiresCredentials(provider.code) &&
      !options.providerCredentials?.[provider.code])
  ) {
    return null;
  }

  const canSearch = options.beforeProviderSearch
    ? await options.beforeProviderSearch(provider.code)
    : true;

  if (!canSearch) {
    return null;
  }

  return normalizeTitleMetadata(await provider.getTitleMetadata(input, options));
}
