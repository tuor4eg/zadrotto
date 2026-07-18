import type { MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
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
    name?: string;
  }>;
  publishers?: Array<{
    name?: string;
  }>;
  genres?: Array<{
    name?: string;
  }>;
};

function getNames(values: Array<{ name?: string } | undefined> | undefined) {
  return [...new Set((values ?? []).map((value) => value?.name?.trim()).filter(Boolean))];
}

function getPlatformNames(values: RawgGameDetailsResponse["platforms"]) {
  return [...new Set((values ?? []).map((value) => value.platform?.name?.trim()).filter(Boolean))];
}

export const rawgProvider: MediaProvider = {
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
    const data = await fetchJson<RawgResponse>(url);

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
        confidence: item.rating,
      }));
  },
  async getTitleMetadata(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();

    if (!apiKey || !input.externalId.trim()) {
      return null;
    }

    const url = buildUrl(`https://api.rawg.io/api/games/${input.externalId}`, {
      key: apiKey,
    });
    const details = await fetchJson<RawgGameDetailsResponse>(url);

    if (!details?.id) {
      return null;
    }

    return {
      provider: "rawg",
      externalId: input.externalId,
      sourceUrl: details.slug ? `https://rawg.io/games/${details.slug}` : `https://rawg.io/games/${details.id}`,
      facts: {
        platforms: getPlatformNames(details.platforms),
        developers: getNames(details.developers),
        publishers: getNames(details.publishers),
        genres: getNames(details.genres),
      },
    };
  },
  async getCoverCandidatesByTitleSource(input, options) {
    const apiKey = options.providerCredentials?.rawg?.apiKey?.trim();
    if (!apiKey || !input.titleSource?.externalId.trim()) return [];
    const details = await fetchJson<RawgGameDetailsResponse>(buildUrl(`https://api.rawg.io/api/games/${input.titleSource.externalId}`, { key: apiKey }));
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
    const data = await fetchJson<RawgResponse>(url);

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
