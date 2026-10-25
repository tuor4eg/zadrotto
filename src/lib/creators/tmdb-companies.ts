import type { RawSnapshot } from "@/lib/providers/types";
import { describeTmdbFilmSource } from "@/lib/providers/tmdb-film-adapter";

export type TmdbCompanyReference = {
  externalId: string; name: string; roleCode: "production_company";
  sourcePosition: number; logoPath: string | null; sourceUrl: string;
};
export function isTmdbCompanyId(value: unknown): value is string {
  return typeof value === "string" && /^company:[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value.slice(8)));
}
/** Missing evidence is never an empty roster. ID, not name, identifies a company. */
export function extractTmdbCompanyReferences(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">): TmdbCompanyReference[] {
  describeTmdbFilmSource(snapshot.externalId);
  const movie = snapshot.payload as Record<string, unknown> | null;
  if (snapshot.providerCode !== "tmdb" || !movie || movie.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (!Array.isArray(movie.production_companies)) throw new Error("INCOMPLETE_TMDB_COMPANIES");
  const unique = new Map<string, TmdbCompanyReference>();
  for (const [sourcePosition, value] of movie.production_companies.entries()) {
    const row = value as Record<string, unknown> | null;
    if (!row || !Number.isSafeInteger(row.id) || Number(row.id) < 1 || typeof row.name !== "string" || !row.name.trim()
      || (row.logo_path != null && (typeof row.logo_path !== "string" || !/^\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(row.logo_path)))) throw new Error("INCOMPLETE_TMDB_COMPANIES");
    const externalId = `company:${row.id}`;
    const ref: TmdbCompanyReference = { externalId, name: row.name.trim(), roleCode: "production_company", sourcePosition,
      logoPath: typeof row.logo_path === "string" ? row.logo_path : null, sourceUrl: `https://www.themoviedb.org/company/${row.id}` };
    const previous = unique.get(externalId);
    if (previous && (previous.name !== ref.name || previous.logoPath !== ref.logoPath)) throw new Error("CONFLICTING_TMDB_COMPANY");
    if (!previous) unique.set(externalId, ref);
  }
  return [...unique.values()];
}

export function isTmdbOrganizationId(value: unknown): value is string {
  return typeof value === "string" && /^(company|network):[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value.split(":")[1]));
}
