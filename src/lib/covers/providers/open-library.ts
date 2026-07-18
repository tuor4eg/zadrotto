import type { MediaProvider } from "@/lib/covers/types";
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
    author_name?: string[];
  }>;
};

type OpenLibraryWorkResponse = {
  title?: string;
  first_publish_date?: string;
  covers?: number[];
  authors?: Array<{
    author?: {
      key?: string;
    };
  }>;
};

type OpenLibraryAuthorResponse = {
  name?: string;
};

function getOpenLibraryKey(externalId: string) {
  return externalId.startsWith("/") ? externalId : null;
}

export const openLibraryProvider: MediaProvider = {
  code: "open-library",
  mediaTypes: ["book"],
  async searchTitleCandidates(input, options) {
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
      .filter((item) => item.key || item.title)
      .slice(0, options.candidateLimit)
      .map((item) => ({
        id: `work:${item.key ?? item.title}`,
        provider: "open-library",
        externalId: item.key ?? item.title ?? query,
        mediaType: input.mediaType,
        title: item.title ?? query,
        originalTitle: null,
        description: item.author_name?.length ? item.author_name.join(", ") : null,
        coverUrl: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg` : null,
        sourcePageUrl: item.key ? `https://openlibrary.org${item.key}` : null,
        releaseYear: item.first_publish_year ?? null,
      }));
  },
  async getTitleMetadata(input) {
    const workKey = getOpenLibraryKey(input.externalId);

    if (!workKey) {
      return null;
    }

    const work = await fetchJson<OpenLibraryWorkResponse>(
      new URL(`https://openlibrary.org${workKey}.json`),
    );
    const authorKeys = (work?.authors ?? [])
      .map((author) => author.author?.key)
      .filter((key): key is string => Boolean(key))
      .slice(0, 8);
    const authors = await Promise.all(
      authorKeys.map(async (authorKey) => {
        const author = await fetchJson<OpenLibraryAuthorResponse>(
          new URL(`https://openlibrary.org${authorKey}.json`),
        );

        return author?.name ?? null;
      }),
    );

    return {
      provider: "open-library",
      externalId: input.externalId,
      sourceUrl: `https://openlibrary.org${workKey}`,
      facts: {
        authors: [...new Set(authors.filter((author): author is string => Boolean(author)))],
      },
    };
  },
  async getCoverCandidatesByTitleSource(input) {
    const workKey = input.titleSource?.externalId ? getOpenLibraryKey(input.titleSource.externalId) : null;
    if (!workKey) return [];
    const work = await fetchJson<OpenLibraryWorkResponse>(new URL(`https://openlibrary.org${workKey}.json`));
    const coverId = work?.covers?.[0];
    if (!coverId) return [];
    return [{ id: `work:${workKey}:${coverId}`, provider: "open-library", title: work.title ?? input.title, imageUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`, sourcePageUrl: `https://openlibrary.org${workKey}`, year: work.first_publish_date ? Number(work.first_publish_date.slice(0, 4)) || undefined : undefined }];
  },
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
