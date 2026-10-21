import { getProviderGenreReferences } from "@/lib/media/genres";
import type { RawSnapshot, SnapshotDescriptor } from "./types";

export const TMDB_FILM_FACT_KEYS = ["runtimeMinutes", "productionCountries", "originalLanguage", "productionCompanies"] as const;

export function describeTmdbFilmSource(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: "tmdb", resourceType: "movie", externalId, apiMethod: "movie.details", requestParams: { language: "ru-RU", append_to_response: "credits" } };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function namedRows(value: unknown) {
  if (!Array.isArray(value) || value.some(row => !record(row) || typeof row.name !== "string")) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return value as Array<{ id?: number; name: string; iso_3166_1?: string }>;
}

/** Genre moderation needs only the provider genre evidence, independently of credits. */
export function normalizeTmdbFilmGenreFacts(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeTmdbFilmSource(snapshot.externalId);
  const movie = record(snapshot.payload);
  if (snapshot.providerCode !== "tmdb" || movie?.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const genres = namedRows(movie.genres);
  const genreReferences = getProviderGenreReferences(genres);
  return { genres: [...new Set(genres.map(row => row.name.trim()).filter(Boolean))],
    ...(genreReferences.length ? { genreReferences } : {}) };
}

/** Credits are evidence only: this projection never reads cast or crew. */
export function normalizeTmdbFilmSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeTmdbFilmSource(snapshot.externalId);
  const movie = record(snapshot.payload);
  const credits = record(movie?.credits);
  if (snapshot.providerCode !== "tmdb" || movie?.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (!credits || !Array.isArray(credits.cast) || !Array.isArray(credits.crew)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const genreFacts = normalizeTmdbFilmGenreFacts(snapshot);
  const companies = namedRows(movie.production_companies);
  if (!Array.isArray(movie.production_countries) || movie.production_countries.some(row => !record(row) || (typeof row.name !== "string" && typeof row.iso_3166_1 !== "string"))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const countries = movie.production_countries as Array<{name?: string; iso_3166_1?: string}>;
  if (!(movie.runtime === null || typeof movie.runtime === "number") || !(movie.original_language === null || typeof movie.original_language === "string")) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const names = (rows: Array<{name: string}>) => [...new Set(rows.map(row => row.name.trim()).filter(Boolean))];
  const mappedFacts: Record<string, unknown> = {
    runtimeMinutes: movie.runtime,
    productionCountries: [...new Set(countries.map(row => row.name?.trim() || row.iso_3166_1?.trim()).filter(Boolean))],
    originalLanguage: movie.original_language,
    productionCompanies: names(companies),
  };
  // Match the existing metadata registry: empty provider values are omitted.
  const facts = Object.fromEntries(Object.entries(mappedFacts).filter(([,value]) => value !== null && value !== undefined
    && (typeof value !== "string" || value.trim().length > 0) && (!Array.isArray(value) || value.length > 0)));
  const title = typeof movie.title === "string" && movie.title.trim() ? movie.title : undefined;
  const original = typeof movie.original_title === "string" && movie.original_title.trim() ? movie.original_title : undefined;
  const year = typeof movie.release_date === "string" && /^\d{4}-/.test(movie.release_date) ? Number(movie.release_date.slice(0, 4)) : undefined;
  return { provider: "tmdb" as const, externalId: snapshot.externalId, sourceUrl: `https://www.themoviedb.org/movie/${snapshot.externalId}`, facts,
    genreFacts,
    fields: { ...(title ? { title } : {}), ...(original ? { originalTitle: original === title ? null : original } : {}),
      ...(year ? { releaseYear: year } : {}), ...(typeof movie.overview === "string" && movie.overview.trim() ? { description: movie.overview } : {}) } };
}
