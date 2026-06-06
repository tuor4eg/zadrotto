import type { CoverCandidate, CoverProvider } from "@/lib/covers/types";
import {
  buildUrl,
  COVER_SEARCH_LIMIT,
  fetchJson,
  getFirstYear,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type GoogleBooksResponse = {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      publishedDate?: string;
      infoLink?: string;
      imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
      };
    };
  }>;
};

export const googleBooksProvider: CoverProvider = {
  code: "google-books",
  mediaTypes: ["book"],
  async searchCoverCandidates(input) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim() ?? "";
    const url = buildUrl("https://www.googleapis.com/books/v1/volumes", {
      q: `intitle:${query}`,
      maxResults: COVER_SEARCH_LIMIT,
      projection: "lite",
      key: apiKey,
    });
    const data = await fetchJson<GoogleBooksResponse>(url);

    const candidates: CoverCandidate[] = [];

    for (const item of data?.items ?? []) {
      const imageUrl =
        item.volumeInfo?.imageLinks?.thumbnail ?? item.volumeInfo?.imageLinks?.smallThumbnail;

      if (!imageUrl || !item.id) {
        continue;
      }

      candidates.push({
        id: `volume:${item.id}`,
        provider: "google-books",
        title: item.volumeInfo?.title ?? query,
        imageUrl: imageUrl.replace(/^http:\/\//i, "https://"),
        sourcePageUrl: item.volumeInfo?.infoLink ?? null,
        year: getFirstYear(item.volumeInfo?.publishedDate),
      });
    }

    return candidates.slice(0, COVER_SEARCH_LIMIT);
  },
};
