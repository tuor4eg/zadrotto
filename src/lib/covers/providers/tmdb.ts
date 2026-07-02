import type { CoverCandidate, MediaProvider, MediaTitleCandidate } from "@/lib/covers/types";
import {
  buildUrl,
  fetchJson,
  getFirstYear,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type TmdbSearchResponse = {
  results?: Array<{
    id?: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    original_language?: string | null;
    overview?: string | null;
    poster_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    popularity?: number;
  }>;
};

type TmdbImagesResponse = {
  posters?: Array<{
    file_path?: string | null;
    width?: number;
    height?: number;
    iso_639_1?: string | null;
    vote_average?: number;
    vote_count?: number;
  }>;
};

type TmdbMovieDetailsResponse = {
  genres?: Array<{
    name?: string;
  }>;
  id?: number;
  original_language?: string | null;
  production_companies?: Array<{
    name?: string;
  }>;
  production_countries?: Array<{
    iso_3166_1?: string;
    name?: string;
  }>;
  runtime?: number | null;
};

type TmdbSeriesDetailsResponse = {
  id?: number;
  episode_run_time?: Array<number | null | undefined>;
  first_air_date?: string | null;
  genres?: Array<{
    name?: string;
  }>;
  last_air_date?: string | null;
  networks?: Array<{
    name?: string;
  }>;
  number_of_episodes?: number | null;
  number_of_seasons?: number | null;
  status?: string | null;
};

function getUniqueTmdbImageLanguages(originalLanguage: string | null | undefined) {
  return [originalLanguage, "null", "en", "ru"]
    .filter((language): language is string => Boolean(language))
    .filter((language, index, languages) => languages.indexOf(language) === index);
}

function getTmdbPosterLanguageRank(
  language: string | null | undefined,
  originalLanguage: string | null | undefined,
) {
  if (language && originalLanguage && language === originalLanguage) {
    return 0;
  }

  if (language === null) {
    return 1;
  }

  if (language === "en") {
    return 2;
  }

  if (language === "ru") {
    return 3;
  }

  return 4;
}

function sortTmdbPosters(
  posters: NonNullable<TmdbImagesResponse["posters"]>,
  originalLanguage: string | null | undefined,
) {
  return [...posters].sort((left, right) => {
    const languageDifference =
      getTmdbPosterLanguageRank(left.iso_639_1, originalLanguage) -
      getTmdbPosterLanguageRank(right.iso_639_1, originalLanguage);

    if (languageDifference !== 0) {
      return languageDifference;
    }

    const voteCountDifference = (right.vote_count ?? 0) - (left.vote_count ?? 0);

    if (voteCountDifference !== 0) {
      return voteCountDifference;
    }

    return (right.vote_average ?? 0) - (left.vote_average ?? 0);
  });
}

function getTmdbType(mediaType: "film" | "series") {
  return mediaType === "series" ? "tv" : "movie";
}

function getTmdbTitle(
  item: NonNullable<TmdbSearchResponse["results"]>[number],
  fallbackTitle: string,
) {
  return item.title ?? item.name ?? item.original_title ?? item.original_name ?? fallbackTitle;
}

function getTmdbOriginalTitle(
  item: NonNullable<TmdbSearchResponse["results"]>[number],
  title: string,
) {
  const originalTitle = item.original_title ?? item.original_name ?? null;

  return originalTitle && originalTitle !== title ? originalTitle : null;
}

function getTmdbYear(item: NonNullable<TmdbSearchResponse["results"]>[number]) {
  return getFirstYear(item.release_date ?? item.first_air_date) ?? null;
}

function getTmdbNames(values: Array<{ name?: string } | undefined> | undefined) {
  return [...new Set((values ?? []).map((value) => value?.name?.trim()).filter(Boolean))];
}

function getTmdbProductionCountries(values: TmdbMovieDetailsResponse["production_countries"]) {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.name?.trim() || value.iso_3166_1?.trim())
        .filter(Boolean),
    ),
  ];
}

function getPositiveTmdbRuntime(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value : null;
}

function getTmdbAverageEpisodeRuntimeMinutes(details: TmdbSeriesDetailsResponse) {
  const episodeRunTimes =
    details.episode_run_time
      ?.map(getPositiveTmdbRuntime)
      .filter((value): value is number => value !== null) ?? [];

  if (episodeRunTimes.length > 0) {
    return Math.round(
      episodeRunTimes.reduce((sum, value) => sum + value, 0) / episodeRunTimes.length,
    );
  }

  return null;
}

function createTmdbClient(input: { accessToken: string; mediaType: "film" | "series" }) {
  const tmdbType = getTmdbType(input.mediaType);
  const headers = { Authorization: `Bearer ${input.accessToken}` };

  return {
    tmdbType,
    searchTitles(query: string) {
      const url = buildUrl(`https://api.themoviedb.org/3/search/${tmdbType}`, {
        query,
        include_adult: false,
        language: "ru-RU",
        page: 1,
      });

      return fetchJson<TmdbSearchResponse>(url, { headers });
    },
    searchImages(id: number, originalLanguage: string | null | undefined) {
      const imagesUrl = buildUrl(`https://api.themoviedb.org/3/${tmdbType}/${id}/images`, {
        include_image_language: getUniqueTmdbImageLanguages(originalLanguage).join(","),
      });

      return fetchJson<TmdbImagesResponse>(imagesUrl, { headers });
    },
    searchMetadata(id: number) {
      const metadataUrl = buildUrl(`https://api.themoviedb.org/3/${tmdbType}/${id}`, {
        language: "ru-RU",
      });

      return fetchJson<TmdbMovieDetailsResponse | TmdbSeriesDetailsResponse>(metadataUrl, { headers });
    },
    sourcePageUrl(id: number) {
      return `https://www.themoviedb.org/${tmdbType}/${id}`;
    },
    posterUrl(path: string) {
      return `https://image.tmdb.org/t/p/w780${path}`;
    },
  };
}

export function createTmdbProvider(mediaType: "film" | "series"): MediaProvider {
  return {
    code: "tmdb",
    mediaTypes: [mediaType],
    async searchTitleCandidates(input, options) {
      const accessToken = options.providerCredentials?.tmdb?.accessToken?.trim();
      const query = normalizeSearchQuery(input);

      if (!accessToken || !query) {
        return [];
      }

      const client = createTmdbClient({ accessToken, mediaType });
      const data = await client.searchTitles(query);
      const candidates: MediaTitleCandidate[] = [];

      for (const item of (data?.results ?? []).slice(0, options.candidateLimit)) {
        if (!item.id) {
          continue;
        }

        const title = getTmdbTitle(item, query);
        const posterPath = item.poster_path ?? null;

        candidates.push({
          id: `${client.tmdbType}:${item.id}`,
          provider: "tmdb",
          externalId: String(item.id),
          mediaType,
          title,
          originalTitle: getTmdbOriginalTitle(item, title),
          description: item.overview ?? null,
          coverUrl: posterPath ? client.posterUrl(posterPath) : null,
          sourcePageUrl: client.sourcePageUrl(item.id),
          releaseYear: getTmdbYear(item),
          confidence: item.popularity,
        });
      }

      return candidates.slice(0, options.candidateLimit);
    },
    async getTitleMetadata(input, options) {
      const accessToken = options.providerCredentials?.tmdb?.accessToken?.trim();
      const id = Number(input.externalId);

      if (!accessToken || !Number.isInteger(id) || id <= 0) {
        return null;
      }

      const client = createTmdbClient({ accessToken, mediaType });
      const details = await client.searchMetadata(id);

      if (mediaType === "film") {
        const movieDetails = details as TmdbMovieDetailsResponse;

        return {
          provider: "tmdb",
          externalId: input.externalId,
          sourceUrl: client.sourcePageUrl(id),
          facts: {
            runtimeMinutes: movieDetails.runtime ?? null,
            genres: getTmdbNames(movieDetails.genres),
            productionCountries: getTmdbProductionCountries(movieDetails.production_countries),
            originalLanguage: movieDetails.original_language ?? null,
            productionCompanies: getTmdbNames(movieDetails.production_companies),
          },
        };
      }

      const seriesDetails = details as TmdbSeriesDetailsResponse;
      const averageEpisodeRuntimeMinutes = getTmdbAverageEpisodeRuntimeMinutes(seriesDetails);

      return {
        provider: "tmdb",
        externalId: input.externalId,
        sourceUrl: client.sourcePageUrl(id),
        facts: {
          seasonCount: seriesDetails.number_of_seasons ?? null,
          episodeCount: seriesDetails.number_of_episodes ?? null,
          averageEpisodeRuntimeMinutes,
          genres: getTmdbNames(seriesDetails.genres),
          networks: getTmdbNames(seriesDetails.networks),
          firstAirYear: getFirstYear(seriesDetails.first_air_date) ?? null,
          lastAirYear: getFirstYear(seriesDetails.last_air_date) ?? null,
        },
      };
    },
    async searchCoverCandidates(input, options) {
      const accessToken = options.providerCredentials?.tmdb?.accessToken?.trim();
      const query = normalizeSearchQuery(input);

      if (!accessToken || !query) {
        return [];
      }

      const client = createTmdbClient({ accessToken, mediaType });
      const data = await client.searchTitles(query);
      const searchResults = (data?.results ?? [])
        .filter((item) => item.id)
        .slice(0, options.tmdbResultScanLimit);
      const candidateGroups = await Promise.all(
        searchResults.map(async (item) => {
          const title = getTmdbTitle(item, query);
          const year = getTmdbYear(item) ?? undefined;
          const images = await client.searchImages(item.id!, item.original_language);
          const posters = sortTmdbPosters(images?.posters ?? [], item.original_language).filter(
            (poster) => poster.file_path,
          );
          const selectedPosters =
            posters.length > 0 ? posters : item.poster_path ? [{ file_path: item.poster_path }] : [];

          return selectedPosters.slice(0, options.candidateLimit).map(
            (poster) =>
              ({
                id: `${client.tmdbType}:${item.id}:${poster.file_path}`,
                provider: "tmdb",
                title,
                imageUrl: client.posterUrl(poster.file_path!),
                sourcePageUrl: client.sourcePageUrl(item.id!),
                width: poster.width,
                height: poster.height,
                year,
                confidence: poster.vote_average ?? item.popularity,
              }) satisfies CoverCandidate,
          );
        }),
      );

      return candidateGroups.flat().slice(0, options.candidateLimit);
    },
  };
}
