import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type ComicVineImage = {
  original_url?: string | null;
  super_url?: string | null;
  screen_url?: string | null;
  medium_url?: string | null;
  small_url?: string | null;
  thumb_url?: string | null;
};

type ComicVinePublisher = {
  name?: string | null;
};

type ComicVineVolume = {
  id?: number;
  name?: string | null;
  deck?: string | null;
  description?: string | null;
  start_year?: string | null;
  count_of_issues?: number | null;
  site_detail_url?: string | null;
  publisher?: ComicVinePublisher | null;
  image?: ComicVineImage | null;
};

type ComicVineResponse<T> = {
  error?: string;
  status_code?: number;
  results?: T;
};

function getComicVineImageUrl(image: ComicVineImage | null | undefined) {
  return (
    image?.original_url ??
    image?.super_url ??
    image?.screen_url ??
    image?.medium_url ??
    image?.small_url ??
    image?.thumb_url ??
    null
  );
}

function getComicVineYear(value: string | null | undefined) {
  const year = Number(value);

  return Number.isInteger(year) && year > 0 ? year : null;
}

function isComicVineOk<T>(
  data: ComicVineResponse<T> | null,
): data is ComicVineResponse<T> & { results: T } {
  return data?.status_code === 1 && data.results !== undefined;
}

function getComicVineHeaders() {
  return {
    "User-Agent": "zadrotto/1.0 comic archive",
  };
}

function getComicVineDescription(volume: ComicVineVolume) {
  return volume.deck?.trim() || volume.description?.replace(/<[^>]*>/g, " ").trim() || null;
}

export const comicVineProvider: MediaProvider = {
  code: "comic-vine",
  mediaTypes: ["comic"],
  async searchTitleCandidates(input, options) {
    const apiKey = options.providerCredentials?.["comic-vine"]?.apiKey?.trim();
    const query = normalizeSearchQuery(input);

    if (!apiKey || !query) {
      return [];
    }

    const url = buildUrl("https://comicvine.gamespot.com/api/search/", {
      api_key: apiKey,
      format: "json",
      resources: "volume",
      query,
      limit: options.candidateLimit,
      field_list: "id,name,deck,description,start_year,site_detail_url,image,publisher,count_of_issues",
    });
    const data = await fetchJson<ComicVineResponse<ComicVineVolume[]>>(url, {
      headers: getComicVineHeaders(),
    });

    if (!isComicVineOk(data)) {
      return [];
    }

    return data.results
      .filter((volume) => volume.id)
      .slice(0, options.candidateLimit)
      .map((volume) => ({
        id: `volume:${volume.id}`,
        provider: "comic-vine",
        externalId: String(volume.id),
        mediaType: input.mediaType,
        title: volume.name ?? query,
        originalTitle: null,
        description: getComicVineDescription(volume),
        coverUrl: getComicVineImageUrl(volume.image),
        sourcePageUrl: volume.site_detail_url ?? null,
        releaseYear: getComicVineYear(volume.start_year),
      }));
  },
  async getTitleMetadata(input, options) {
    const apiKey = options.providerCredentials?.["comic-vine"]?.apiKey?.trim();
    const id = Number(input.externalId);

    if (!apiKey || !Number.isInteger(id) || id <= 0) {
      return null;
    }

    const url = buildUrl(`https://comicvine.gamespot.com/api/volume/4050-${id}/`, {
      api_key: apiKey,
      format: "json",
      field_list: "id,name,start_year,site_detail_url,publisher,count_of_issues",
    });
    const data = await fetchJson<ComicVineResponse<ComicVineVolume>>(url, {
      headers: getComicVineHeaders(),
    });

    if (!isComicVineOk(data) || !data.results.id) {
      return null;
    }

    return {
      provider: "comic-vine",
      externalId: input.externalId,
      sourceUrl: data.results.site_detail_url ?? null,
      facts: {
        publisher: data.results.publisher?.name ?? null,
        issueCount: data.results.count_of_issues ?? null,
        startYear: getComicVineYear(data.results.start_year),
      },
    };
  },
  async getCoverCandidatesByTitleSource(input, options) {
    const apiKey = options.providerCredentials?.["comic-vine"]?.apiKey?.trim();
    const id = Number(input.titleSource?.externalId);
    if (!apiKey || !Number.isInteger(id) || id <= 0) return [];
    const data = await fetchJson<ComicVineResponse<ComicVineVolume>>(buildUrl(`https://comicvine.gamespot.com/api/volume/4050-${id}/`, { api_key: apiKey, format: "json", field_list: "id,name,start_year,site_detail_url,image" }), { headers: getComicVineHeaders() });
    const imageUrl = isComicVineOk(data) ? getComicVineImageUrl(data.results.image) : null;
    if (!isComicVineOk(data) || !data.results.id || !imageUrl) return [];
    return [{ id: `volume:${data.results.id}`, provider: "comic-vine", title: data.results.name ?? input.title, imageUrl, sourcePageUrl: data.results.site_detail_url ?? null, year: getComicVineYear(data.results.start_year) ?? undefined }];
  },
  async searchCoverCandidates(input, options) {
    const apiKey = options.providerCredentials?.["comic-vine"]?.apiKey?.trim();
    const query = normalizeSearchQuery(input);

    if (!apiKey || !query) {
      return [];
    }

    const url = buildUrl("https://comicvine.gamespot.com/api/search/", {
      api_key: apiKey,
      format: "json",
      resources: "volume",
      query,
      limit: options.candidateLimit,
      field_list: "id,name,start_year,site_detail_url,image",
    });
    const data = await fetchJson<ComicVineResponse<ComicVineVolume[]>>(url, {
      headers: getComicVineHeaders(),
    });

    if (!isComicVineOk(data)) {
      return [];
    }

    const candidates: CoverCandidate[] = [];

    for (const volume of data.results) {
      const imageUrl = getComicVineImageUrl(volume.image);

      if (!imageUrl || !volume.id) {
        continue;
      }

      candidates.push({
        id: `volume:${volume.id}`,
        provider: "comic-vine",
        title: volume.name ?? query,
        imageUrl,
        sourcePageUrl: volume.site_detail_url ?? null,
        year: getComicVineYear(volume.start_year) ?? undefined,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
