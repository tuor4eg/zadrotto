import { getProviderGenreReferences } from "@/lib/media/genres";
import { mapTmdbSeasons } from "@/lib/covers/providers/tmdb";
import type { TmdbCompanyReference } from "@/lib/creators/tmdb-companies";
import type { TmdbDirectorReference } from "@/lib/creators/tmdb-directors";
import type { RawSnapshot, SnapshotDescriptor } from "./types";

export type TmdbSeriesCompanyReference = Omit<TmdbCompanyReference, "roleCode"> & { roleCode: "production_company" | "network" };
export type TmdbSeriesPersonReference = Omit<TmdbDirectorReference, "roleCode"> & { roleCode: "creator" | "showrunner" };
export const TMDB_SERIES_FACT_KEYS = ["seasonCount", "episodeCount", "averageEpisodeRuntimeMinutes", "firstAirYear", "lastAirYear", "productionCompanies", "networks"] as const;
export function describeTmdbSeriesSource(externalId: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: "tmdb", resourceType: "tv", externalId, apiMethod: "tv.details", requestParams: { language: "ru-RU", append_to_response: "aggregate_credits" } };
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function seriesPayload(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  describeTmdbSeriesSource(snapshot.externalId);
  const payload = record(snapshot.payload);
  if (snapshot.providerCode !== "tmdb" || payload?.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return payload;
}
function namedRows(value: unknown) {
  if (!Array.isArray(value) || value.some(row => !record(row) || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.name !== "string" || !row.name.trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return value as Array<{ id: number; name: string; logo_path?: string | null; jobs?: unknown }>;
}
export function extractTmdbSeriesCreatorReferences(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  const tv = seriesPayload(snapshot);
  const credits = record(tv.aggregate_credits);
  if (!credits || !Array.isArray(credits.cast)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const companyRows = namedRows(tv.production_companies);
  const networkRows = namedRows(tv.networks);
  const creatorRows = namedRows(tv.created_by);
  const crewRows = namedRows(credits.crew);
  const companyRefs = (rows: ReturnType<typeof namedRows>, roleCode: "production_company" | "network") => {
    const refs = new Map<string, TmdbSeriesCompanyReference>();
    rows.forEach((row, sourcePosition) => {
      if (row.logo_path != null && (typeof row.logo_path !== "string" || !/^\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(row.logo_path))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
      const resource = roleCode === "network" ? "network" : "company";
      const ref = { externalId: `${resource}:${row.id}`, name: row.name.trim(), roleCode, sourcePosition, logoPath: row.logo_path ?? null, sourceUrl: `https://www.themoviedb.org/${resource}/${row.id}` };
      const previous = refs.get(ref.externalId);
      if (previous && (previous.name !== ref.name || previous.logoPath !== ref.logoPath)) throw new Error("CONFLICTING_TMDB_COMPANY");
      if (!previous) refs.set(ref.externalId, ref);
    });
    return [...refs.values()];
  };
  const personRefs = (rows: ReturnType<typeof namedRows>, roleCode: "creator" | "showrunner") => {
    const refs = new Map<string, TmdbSeriesPersonReference>();
    rows.forEach((row, sourcePosition) => {
      if (roleCode === "showrunner") {
        if (!Array.isArray(row.jobs) || row.jobs.some(job => !record(job) || typeof job.job !== "string")) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
        if (!row.jobs.some(job => job.job === "Showrunner")) return;
      }
      const ref = { externalId: `person:${row.id}`, name: row.name.trim(), roleCode, sourcePosition, sourceUrl: `https://www.themoviedb.org/person/${row.id}` };
      const previous = refs.get(ref.externalId);
      if (previous && previous.name !== ref.name) throw new Error("CONFLICTING_TMDB_DIRECTOR");
      if (!previous) refs.set(ref.externalId, ref);
    });
    return [...refs.values()];
  };
  return { companies: companyRefs(companyRows, "production_company"), networks: companyRefs(networkRows, "network"), creators: personRefs(creatorRows, "creator"), showrunners: personRefs(crewRows, "showrunner") };
}
export function normalizeTmdbSeriesGenreFacts(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  const tv = seriesPayload(snapshot);
  const genres = namedRows(tv.genres);
  const genreReferences = getProviderGenreReferences(genres);
  return { genres: [...new Set(genres.map(row => row.name.trim()))], ...(genreReferences.length ? { genreReferences } : {}) };
}
export function normalizeTmdbSeriesSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  const tv = seriesPayload(snapshot);
  const creatorReferences = extractTmdbSeriesCreatorReferences(snapshot);
  const genreFacts = normalizeTmdbSeriesGenreFacts(snapshot);
  if (!Array.isArray(tv.seasons) || tv.seasons.some(row => !record(row)) || !Array.isArray(tv.episode_run_time) || tv.episode_run_time.some(n => typeof n !== "number" || !Number.isFinite(n))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  for (const key of ["number_of_seasons", "number_of_episodes"]) if (tv[key] !== null && (!Number.isSafeInteger(tv[key]) || Number(tv[key]) < 0)) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const year = (value: unknown) => typeof value === "string" && /^\d{4}-/.test(value) ? Number(value.slice(0, 4)) : null;
  const runtimes = tv.episode_run_time.filter((n): n is number => typeof n === "number" && n > 0);
  const facts: Record<string, unknown> = Object.fromEntries(Object.entries({ seasonCount: tv.number_of_seasons, episodeCount: tv.number_of_episodes,
    averageEpisodeRuntimeMinutes: runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null,
    firstAirYear: year(tv.first_air_date), lastAirYear: year(tv.last_air_date) }).filter(([, value]) => value !== null));
  const title = typeof tv.name === "string" && tv.name.trim() ? tv.name : undefined;
  const original = typeof tv.original_name === "string" && tv.original_name.trim() ? tv.original_name : undefined;
  return { provider: "tmdb" as const, externalId: snapshot.externalId, sourceUrl: `https://www.themoviedb.org/tv/${snapshot.externalId}`, facts, genreFacts, creatorReferences,
    parts: mapTmdbSeasons(tv.seasons as Parameters<typeof mapTmdbSeasons>[0]),
    fields: { ...(title ? { title } : {}), ...(original ? { originalTitle: original === title ? null : original } : {}), ...(year(tv.first_air_date) ? { releaseYear: year(tv.first_air_date)! } : {}), ...(typeof tv.overview === "string" && tv.overview.trim() ? { description: tv.overview } : {}) } };
}
