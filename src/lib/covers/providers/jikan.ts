import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type JikanSearchResponse = {
  data?: Array<{
    mal_id?: number;
    title?: string;
    title_english?: string | null;
    synopsis?: string | null;
    year?: number | null;
    url?: string;
    images?: {
      jpg?: {
        large_image_url?: string;
        image_url?: string;
      };
      webp?: {
        large_image_url?: string;
        image_url?: string;
      };
    };
  }>;
};

type JikanAnimeDetailsResponse = {
  data?: {
    mal_id?: number;
    episodes?: number | null;
    status?: string | null;
    type?: string | null;
    duration?: string | null;
    url?: string;
  };
};

function getJikanImageUrl(item: NonNullable<JikanSearchResponse["data"]>[number]) {
  return (
    item.images?.webp?.large_image_url ??
    item.images?.jpg?.large_image_url ??
    item.images?.webp?.image_url ??
    item.images?.jpg?.image_url ??
    null
  );
}

function getJikanEpisodeRuntimeMinutes(duration: string | null | undefined) {
  if (!duration) {
    return null;
  }

  const hours = duration.match(/(\d+)\s*hr/i)?.[1];
  const minutes = duration.match(/(\d+)\s*min/i)?.[1];
  const totalMinutes = Number(hours ?? 0) * 60 + Number(minutes ?? 0);

  return totalMinutes > 0 ? totalMinutes : null;
}

export const jikanProvider: MediaProvider = {
  code: "jikan",
  mediaTypes: ["anime"],
  async searchTitleCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const url = buildUrl("https://api.jikan.moe/v4/anime", {
      q: query,
      limit: options.candidateLimit,
      sfw: true,
    });
    const data = await fetchJson<JikanSearchResponse>(url);

    return (data?.data ?? [])
      .filter((item) => item.mal_id)
      .slice(0, options.candidateLimit)
      .map((item) => {
        const title = item.title_english ?? item.title ?? query;
        const originalTitle = item.title && item.title !== title ? item.title : null;

        return {
          id: `anime:${item.mal_id}`,
          provider: "jikan",
          externalId: String(item.mal_id),
          mediaType: input.mediaType,
          title,
          originalTitle,
          description: item.synopsis ?? null,
          coverUrl: getJikanImageUrl(item),
          sourcePageUrl: item.url ?? null,
          releaseYear: item.year ?? null,
        };
      });
  },
  async getTitleMetadata(input) {
    const id = Number(input.externalId);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const details = await fetchJson<JikanAnimeDetailsResponse>(
      new URL(`https://api.jikan.moe/v4/anime/${id}/full`),
    );

    if (!details?.data?.mal_id) {
      return null;
    }

    return {
      provider: "jikan",
      externalId: input.externalId,
      sourceUrl: details.data.url ?? null,
      facts: {
        episodeCount: details.data.episodes ?? null,
        status: details.data.status ?? null,
        animeType: details.data.type ?? null,
        averageEpisodeRuntimeMinutes: getJikanEpisodeRuntimeMinutes(details.data.duration),
      },
    };
  },
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const url = buildUrl("https://api.jikan.moe/v4/anime", {
      q: query,
      limit: options.candidateLimit,
      sfw: true,
    });
    const data = await fetchJson<JikanSearchResponse>(url);

    const candidates: CoverCandidate[] = [];

    for (const item of data?.data ?? []) {
      const imageUrl = getJikanImageUrl(item);

      if (!imageUrl || !item.mal_id) {
        continue;
      }

      candidates.push({
        id: `anime:${item.mal_id}`,
        provider: "jikan",
        title: item.title_english ?? item.title ?? query,
        imageUrl,
        sourcePageUrl: item.url ?? null,
        year: item.year ?? undefined,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
