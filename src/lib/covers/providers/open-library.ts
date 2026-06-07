import type { CoverProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type OpenLibrarySearchResponse = {
  docs?: Array<{
    key?: string;
    title?: string;
    first_publish_year?: number;
    cover_i?: number;
  }>;
};

export const openLibraryProvider: CoverProvider = {
  code: "open-library",
  mediaTypes: ["book"],
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const url = buildUrl("https://openlibrary.org/search.json", {
      title: query,
      limit: options.candidateLimit,
    });
    const data = await fetchJson<OpenLibrarySearchResponse>(url);

    return (data?.docs ?? [])
      .filter((item) => item.cover_i)
      .slice(0, options.candidateLimit)
      .map((item) => ({
        id: `work:${item.key ?? item.cover_i}`,
        provider: "open-library",
        title: item.title ?? query,
        imageUrl: `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg`,
        sourcePageUrl: item.key ? `https://openlibrary.org${item.key}` : null,
        year: item.first_publish_year,
      }));
  },
};
