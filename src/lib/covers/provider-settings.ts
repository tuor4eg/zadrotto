import type { CoverProviderCode, MediaProvider } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media/types";

export const TITLE_SEARCH_MODES = ["parallel", "fallback", "off"] as const;
export type TitleSearchMode = (typeof TITLE_SEARCH_MODES)[number];

// This module is also consumed by client forms. Keep server adapters out of its import graph.
const DEFAULT_PROVIDER_CATALOG = [
  { code: "bgg", mediaTypes: ["boardgame"] },
  { code: "tmdb", mediaTypes: ["film"] },
  { code: "tmdb", mediaTypes: ["series"] },
  { code: "comic-vine", mediaTypes: ["comic"] },
  { code: "open-library", mediaTypes: ["book"] },
  { code: "google-books", mediaTypes: ["book"] },
  { code: "fantlab", mediaTypes: ["book"] },
  { code: "igdb", mediaTypes: ["game"] },
  { code: "rawg", mediaTypes: ["game"] },
  { code: "roblox", mediaTypes: ["roblox"] },
  { code: "jikan", mediaTypes: ["anime"] },
  { code: "anilist", mediaTypes: ["anime"] },
  { code: "tmdb", mediaTypes: ["anime"] },
] as const satisfies readonly Pick<MediaProvider, "code" | "mediaTypes">[];

export type CoverProviderMediaSetting = {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
  enabled: boolean;
  titleSearchMode: TitleSearchMode;
  coverSearchEnabled: boolean;
  priority: number;
};

export const COVER_PROVIDER_LABELS = {
  bgg: "BoardGameGeek",
  tmdb: "TMDB",
  "comic-vine": "ComicVine",
  "open-library": "Open Library",
  "google-books": "Google Books",
  igdb: "IGDB",
  rawg: "RAWG",
  jikan: "Jikan",
  anilist: "AniList",
  fantlab: "FantLab",
  roblox: "Roblox",
} as const satisfies Record<CoverProviderCode, string>;

export function getCoverProviderSettingKey(input: {
  mediaType: MediaType;
  providerCode: CoverProviderCode;
}) {
  return `${input.mediaType}:${input.providerCode}`;
}

export function getCoverProviderDefaultSettings(
  providers: readonly Pick<MediaProvider, "code" | "mediaTypes">[] = DEFAULT_PROVIDER_CATALOG,
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
        titleSearchMode:
          mediaType === "anime" && provider.code === "tmdb" ? "off" : "parallel",
        coverSearchEnabled: provider.code !== "bgg",
        priority,
      });
    }
  }

  return [...settingsByKey.values()];
}
