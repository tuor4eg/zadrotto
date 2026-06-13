import type { CoverCandidate, CoverProvider } from "@/lib/covers/types";
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

export function createTmdbProvider(mediaType: "film" | "series"): CoverProvider {
  return {
    code: "tmdb",
    mediaTypes: [mediaType],
    async searchCoverCandidates(input, options) {
      const accessToken = options.providerCredentials?.tmdb?.accessToken?.trim();
      const query = normalizeSearchQuery(input);

      if (!accessToken || !query) {
        return [];
      }

      const isSeries = mediaType === "series";
      const url = buildUrl(`https://api.themoviedb.org/3/search/${isSeries ? "tv" : "movie"}`, {
        query,
        include_adult: false,
        language: "ru-RU",
        page: 1,
      });
      const data = await fetchJson<TmdbSearchResponse>(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const tmdbType = isSeries ? "tv" : "movie";
      const searchResults = (data?.results ?? [])
        .filter((item) => item.id)
        .slice(0, options.tmdbResultScanLimit);
      const candidateGroups = await Promise.all(
        searchResults.map(async (item) => {
          const title = item.title ?? item.name ?? item.original_title ?? item.original_name ?? query;
          const year = getFirstYear(item.release_date ?? item.first_air_date);
          const imagesUrl = buildUrl(`https://api.themoviedb.org/3/${tmdbType}/${item.id}/images`, {
            include_image_language: getUniqueTmdbImageLanguages(item.original_language).join(","),
          });
          const images = await fetchJson<TmdbImagesResponse>(imagesUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const posters = sortTmdbPosters(images?.posters ?? [], item.original_language).filter(
            (poster) => poster.file_path,
          );
          const selectedPosters =
            posters.length > 0 ? posters : item.poster_path ? [{ file_path: item.poster_path }] : [];

          return selectedPosters.slice(0, options.candidateLimit).map(
            (poster) =>
              ({
                id: `${tmdbType}:${item.id}:${poster.file_path}`,
                provider: "tmdb",
                title,
                imageUrl: `https://image.tmdb.org/t/p/w780${poster.file_path}`,
                sourcePageUrl: `https://www.themoviedb.org/${tmdbType}/${item.id}`,
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
