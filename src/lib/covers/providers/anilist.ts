import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import { fetchJson, normalizeSearchQuery } from "@/lib/covers/providers/shared";

type AniListMedia = {
  id?: number;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  description?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  };
  siteUrl?: string | null;
  startDate?: {
    year?: number | null;
  } | null;
  seasonYear?: number | null;
  popularity?: number | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  genres?: string[] | null;
  status?: string | null;
  studios?: {
    nodes?: Array<{
      name?: string | null;
    }> | null;
  } | null;
};

type AniListResponse = {
  data?: {
    Page?: {
      media?: AniListMedia[];
    };
    Media?: AniListMedia | null;
  };
};

const ANILIST_URL = new URL("https://graphql.anilist.co");

const ANILIST_MEDIA_FIELDS = `
  id
  title {
    english
    romaji
    native
  }
  description(asHtml: false)
  coverImage {
    extraLarge
    large
    medium
  }
  siteUrl
  startDate {
    year
  }
  seasonYear
  popularity
  episodes
  duration
  format
  genres
  status
  studios {
    nodes {
      name
    }
  }
`;

async function queryAniList(query: string, variables: Record<string, unknown>) {
  return fetchJson<AniListResponse>(ANILIST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
}

function getAniListTitle(item: AniListMedia, fallbackTitle: string) {
  return item.title?.english ?? item.title?.romaji ?? item.title?.native ?? fallbackTitle;
}

function getAniListOriginalTitle(item: AniListMedia, title: string) {
  const originalTitle = item.title?.romaji ?? item.title?.native ?? null;

  return originalTitle && originalTitle !== title ? originalTitle : null;
}

function getAniListImageUrl(item: AniListMedia) {
  return item.coverImage?.extraLarge ?? item.coverImage?.large ?? item.coverImage?.medium ?? null;
}

function getAniListReleaseYear(item: AniListMedia) {
  return item.seasonYear ?? item.startDate?.year ?? null;
}

function getUniqueAniListNames(values: Array<string | null | undefined> | null | undefined) {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean))];
}

function getAniListStudioNames(item: AniListMedia) {
  return getUniqueAniListNames(item.studios?.nodes?.map((studio) => studio.name));
}

async function searchAniListAnime(query: string, candidateLimit: number) {
  const response = await queryAniList(
    `query SearchAnime($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    }`,
    { search: query, perPage: candidateLimit },
  );

  return response?.data?.Page?.media ?? [];
}

async function getAniListAnime(id: number) {
  const response = await queryAniList(
    `query Anime($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${ANILIST_MEDIA_FIELDS}
      }
    }`,
    { id },
  );

  return response?.data?.Media ?? null;
}

export const anilistProvider: MediaProvider = {
  code: "anilist",
  mediaTypes: ["anime"],
  async searchTitleCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const media = await searchAniListAnime(query, options.candidateLimit);

    return media
      .filter((item) => item.id)
      .slice(0, options.candidateLimit)
      .map((item) => {
        const title = getAniListTitle(item, query);

        return {
          id: `anime:${item.id}`,
          provider: "anilist",
          externalId: String(item.id),
          mediaType: input.mediaType,
          title,
          originalTitle: getAniListOriginalTitle(item, title),
          description: item.description ?? null,
          coverUrl: getAniListImageUrl(item),
          sourcePageUrl: item.siteUrl ?? null,
          releaseYear: getAniListReleaseYear(item),
          confidence: item.popularity ?? undefined,
        };
      });
  },
  async getTitleMetadata(input) {
    const id = Number(input.externalId);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const media = await getAniListAnime(id);

    if (!media?.id) {
      return null;
    }

    return {
      provider: "anilist",
      externalId: input.externalId,
      sourceUrl: media.siteUrl ?? null,
      facts: {
        episodeCount: media.episodes ?? null,
        status: media.status ?? null,
        animeType: media.format ?? null,
        averageEpisodeRuntimeMinutes: media.duration ?? null,
        genres: getUniqueAniListNames(media.genres),
        studios: getAniListStudioNames(media),
      },
    };
  },
  async getCoverCandidatesByTitleSource(input) {
    const id = Number(input.titleSource?.externalId);

    if (!Number.isInteger(id) || id <= 0) {
      return [];
    }

    const media = await getAniListAnime(id);
    const imageUrl = media ? getAniListImageUrl(media) : null;

    if (!media?.id || !imageUrl) {
      return [];
    }

    return [{
      id: `anime:${media.id}`,
      provider: "anilist",
      title: getAniListTitle(media, input.title),
      imageUrl,
      sourcePageUrl: media.siteUrl ?? null,
      year: getAniListReleaseYear(media) ?? undefined,
    }];
  },
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const media = await searchAniListAnime(query, options.candidateLimit);
    const candidates: CoverCandidate[] = [];

    for (const item of media) {
      const imageUrl = getAniListImageUrl(item);

      if (!item.id || !imageUrl) {
        continue;
      }

      candidates.push({
        id: `anime:${item.id}`,
        provider: "anilist",
        title: getAniListTitle(item, query),
        imageUrl,
        sourcePageUrl: item.siteUrl ?? null,
        year: getAniListReleaseYear(item) ?? undefined,
        confidence: item.popularity ?? undefined,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
