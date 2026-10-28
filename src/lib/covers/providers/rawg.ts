import { fetchRawgJson } from "@/lib/creators/game-company-api";
import type { MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  getFirstYear,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type RawgResponse = {
  results?: Array<{
    id?: number;
    name?: string;
    slug?: string;
    description_raw?: string;
    released?: string | null;
    background_image?: string | null;
    rating?: number;
    platforms?: RawgGameDetailsResponse["platforms"];
  }>;
};

type RawgGameDetailsResponse = {
  id?: number;
  name?: string;
  released?: string | null;
  background_image?: string | null;
  rating?: number;
  slug?: string;
  platforms?: Array<{
    platform?: {
      name?: string;
    };
  }>;
  developers?: Array<{
    id?: number;
    slug?: string;
    name?: string;
  }>;
  publishers?: Array<{
    id?: number;
    slug?: string;
    name?: string;
  }>;
  genres?: Array<{
    id?: number;
    name?: string;
  }>;
};

function getPlatformNames(values: RawgGameDetailsResponse["platforms"]) {
  return [...new Set((values ?? []).map((value) => value.platform?.name?.trim()).filter((name): name is string => Boolean(name)))];
}

export function createRawgProvider(request = fetchRawgJson): MediaProvider {
return {
  code: "rawg",
  mediaTypes: ["game"],
  async searchTitleCandidates(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();
    const query = normalizeSearchQuery(input);

    if (!apiKey || !query) {
      return [];
    }

    const url = buildUrl("https://api.rawg.io/api/games", {
      key: apiKey,
      search: query,
      page_size: options.candidateLimit,
    });
    const data = await request<RawgResponse>(url);

    return (data?.results ?? [])
      .filter((item) => item.id)
      .slice(0, options.candidateLimit)
      .map((item) => ({
        id: `game:${item.id}`,
        provider: "rawg",
        externalId: String(item.id),
        mediaType: input.mediaType,
        title: item.name ?? query,
        originalTitle: null,
        description: item.description_raw ?? null,
        coverUrl: item.background_image ?? null,
        sourcePageUrl: item.slug ? `https://rawg.io/games/${item.slug}` : `https://rawg.io/games/${item.id}`,
        releaseYear: getFirstYear(item.released) ?? null,
        platforms: getPlatformNames(item.platforms),
        confidence: item.rating,
      }));
  },
  async getTitleMetadata(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();

    if (!apiKey || !input.externalId.trim()) {
      return null;
    }

    const { fetchGameMetadata } = await import("@/lib/providers/game-service");
    return fetchGameMetadata(input, options, request === fetchRawgJson ? {} : { rawgRequest: request });
  },
  async getCoverCandidatesByTitleSource(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();
    if (!apiKey || !input.titleSource?.externalId.trim()) return [];
    const details = await request<RawgGameDetailsResponse>(buildUrl(`https://api.rawg.io/api/games/${input.titleSource.externalId}`, { key: apiKey }));
    if (!details?.id || !details.background_image) return [];
    return [{ id: `game:${details.id}`, provider: "rawg", title: details.name ?? input.title, imageUrl: details.background_image, sourcePageUrl: details.slug ? `https://rawg.io/games/${details.slug}` : `https://rawg.io/games/${details.id}`, year: getFirstYear(details.released) ?? undefined, confidence: details.rating }];
  },
  async searchCoverCandidates(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();
    const query = normalizeSearchQuery(input);

    if (!apiKey || !query) {
      return [];
    }

    const url = buildUrl("https://api.rawg.io/api/games", {
      key: apiKey,
      search: query,
      page_size: options.candidateLimit,
    });
    const data = await request<RawgResponse>(url);

    return (data?.results ?? [])
      .filter((item) => item.id && item.background_image)
      .slice(0, options.candidateLimit)
      .map((item) => ({
        id: `game:${item.id}`,
        provider: "rawg",
        title: item.name ?? query,
        imageUrl: item.background_image!,
        sourcePageUrl: item.slug ? `https://rawg.io/games/${item.slug}` : `https://rawg.io/games/${item.id}`,
        year: getFirstYear(item.released),
        confidence: item.rating,
      }));
  },
};

}
export const rawgProvider = createRawgProvider();
