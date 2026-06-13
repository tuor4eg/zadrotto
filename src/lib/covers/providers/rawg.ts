import type { CoverProvider } from "@/lib/covers/types";
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
    released?: string | null;
    background_image?: string | null;
    rating?: number;
  }>;
};

export const rawgProvider: CoverProvider = {
  code: "rawg",
  mediaTypes: ["game"],
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
        sourcePageUrl: `https://rawg.io/games/${item.id}`,
        year: getFirstYear(item.released),
        confidence: item.rating,
      }));
  },
};
