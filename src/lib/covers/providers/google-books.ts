import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  getFirstYear,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type GoogleBookImageLinks = {
  thumbnail?: string;
  smallThumbnail?: string;
};

type GoogleBooksResponse = {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      subtitle?: string;
      authors?: string[];
      description?: string;
      publishedDate?: string;
      infoLink?: string;
      imageLinks?: GoogleBookImageLinks;
    };
  }>;
};

type GoogleBookDetailsResponse = NonNullable<GoogleBooksResponse["items"]>[number];

function getGoogleBookImageUrl(imageLinks: GoogleBookImageLinks | undefined) {
  return (
    (imageLinks?.thumbnail ?? imageLinks?.smallThumbnail ?? null)?.replace(/^http:\/\//i, "https://") ??
    null
  );
}

export const googleBooksProvider: MediaProvider = {
  code: "google-books",
  mediaTypes: ["book"],
  async searchTitleCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const apiKey = options.providerCredentials?.["google-books"]?.apiKey?.trim() ?? "";
    const url = buildUrl("https://www.googleapis.com/books/v1/volumes", {
      q: `intitle:${query}`,
      maxResults: options.candidateLimit,
      projection: "lite",
      key: apiKey,
    });
    const data = await fetchJson<GoogleBooksResponse>(url);

    return (data?.items ?? [])
      .filter((item) => item.id)
      .slice(0, options.candidateLimit)
      .map((item) => ({
        id: `volume:${item.id}`,
        provider: "google-books",
        externalId: item.id!,
        mediaType: input.mediaType,
        title: item.volumeInfo?.title ?? query,
        originalTitle: item.volumeInfo?.subtitle ?? null,
        description: item.volumeInfo?.description ?? null,
        coverUrl: getGoogleBookImageUrl(item.volumeInfo?.imageLinks),
        sourcePageUrl: item.volumeInfo?.infoLink ?? null,
        releaseYear: getFirstYear(item.volumeInfo?.publishedDate) ?? null,
      }));
  },
  async getTitleMetadata(input, options) {
    const apiKey = options.providerCredentials?.["google-books"]?.apiKey?.trim() ?? "";
    const url = buildUrl(`https://www.googleapis.com/books/v1/volumes/${input.externalId}`, {
      key: apiKey,
    });
    const details = await fetchJson<GoogleBookDetailsResponse>(url);

    if (!details?.id) {
      return null;
    }

    return {
      provider: "google-books",
      externalId: input.externalId,
      sourceUrl: details.volumeInfo?.infoLink ?? null,
      facts: {
        authors: details.volumeInfo?.authors ?? null,
      },
    };
  },
  async getCoverCandidatesByTitleSource(input, options) {
    const apiKey = options.providerCredentials?.["google-books"]?.apiKey?.trim() ?? "";
    const details = await fetchJson<GoogleBookDetailsResponse>(buildUrl(`https://www.googleapis.com/books/v1/volumes/${input.titleSource?.externalId}`, { key: apiKey }));
    const imageUrl = getGoogleBookImageUrl(details?.volumeInfo?.imageLinks);
    if (!details?.id || !imageUrl) return [];
    return [{ id: `volume:${details.id}`, provider: "google-books", title: details.volumeInfo?.title ?? input.title, imageUrl, sourcePageUrl: details.volumeInfo?.infoLink ?? null, year: getFirstYear(details.volumeInfo?.publishedDate) ?? undefined }];
  },
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const apiKey = options.providerCredentials?.["google-books"]?.apiKey?.trim() ?? "";
    const url = buildUrl("https://www.googleapis.com/books/v1/volumes", {
      q: `intitle:${query}`,
      maxResults: options.candidateLimit,
      projection: "lite",
      key: apiKey,
    });
    const data = await fetchJson<GoogleBooksResponse>(url);

    const candidates: CoverCandidate[] = [];

    for (const item of data?.items ?? []) {
      const imageUrl = getGoogleBookImageUrl(item.volumeInfo?.imageLinks);

      if (!imageUrl || !item.id) {
        continue;
      }

      candidates.push({
        id: `volume:${item.id}`,
        provider: "google-books",
        title: item.volumeInfo?.title ?? query,
        imageUrl,
        sourcePageUrl: item.volumeInfo?.infoLink ?? null,
        year: getFirstYear(item.volumeInfo?.publishedDate),
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
