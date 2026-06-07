import { COVER_PROVIDERS } from "@/lib/covers/providers";
import type { CoverProvider, CoverProviderCode } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media-types";

export type CoverProviderMediaSetting = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled: boolean;
  priority: number;
};

export const COVER_PROVIDER_LABELS = {
  tmdb: "TMDB",
  "open-library": "Open Library",
  "google-books": "Google Books",
  igdb: "IGDB",
  rawg: "RAWG",
  jikan: "Jikan",
} as const satisfies Record<CoverProviderCode, string>;

export function getCoverProviderSettingKey(input: {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
}) {
  return `${input.mediaType}:${input.providerCode}`;
}

export function getCoverProviderDefaultSettings(
  providers: readonly CoverProvider[] = COVER_PROVIDERS,
): CoverProviderMediaSetting[] {
  const prioritiesByMediaType = new Map<MediaType, number>();
  const settingsByKey = new Map<string, CoverProviderMediaSetting>();

  for (const provider of providers) {
    for (const mediaType of provider.mediaTypes) {
      const key = getCoverProviderSettingKey({
        mediaType,
        providerCode: provider.code,
      });

      if (settingsByKey.has(key)) {
        continue;
      }

      const priority = (prioritiesByMediaType.get(mediaType) ?? 0) + 10;

      prioritiesByMediaType.set(mediaType, priority);
      settingsByKey.set(key, {
        mediaType,
        providerCode: provider.code,
        enabled: true,
        priority,
      });
    }
  }

  return [...settingsByKey.values()];
}
