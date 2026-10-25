import type { RawSnapshot } from "@/lib/providers/types";
import { describeTmdbFilmSource } from "@/lib/providers/tmdb-film-adapter";

export type TmdbDirectorReference = { externalId: string; name: string; roleCode: "director"; sourcePosition: number; sourceUrl: string };
export function isTmdbPersonId(value: unknown): value is string {
  return typeof value === "string" && /^person:[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value.slice(7)));
}
/** Missing or damaged evidence must never clear an existing roster. */
export function extractTmdbDirectorReferences(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">): TmdbDirectorReference[] {
  describeTmdbFilmSource(snapshot.externalId);
  const movie = snapshot.payload;
  if (snapshot.providerCode !== "tmdb" || !movie || typeof movie !== "object" || Array.isArray(movie) || movie.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const credits = movie.credits;
  if (!credits || typeof credits !== "object" || Array.isArray(credits) || !Array.isArray(credits.crew)) throw new Error("INCOMPLETE_TMDB_DIRECTORS");
  const unique = new Map<string, TmdbDirectorReference>();
  for (const [sourcePosition, row] of credits.crew.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.job !== "string") throw new Error("INCOMPLETE_TMDB_DIRECTORS");
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || typeof row.name !== "string" || !row.name.trim()) throw new Error("INCOMPLETE_TMDB_DIRECTORS");
    if (row.job !== "Director") continue;
    const externalId = `person:${row.id}`;
    const ref: TmdbDirectorReference = { externalId, name: row.name.trim(), roleCode: "director", sourcePosition, sourceUrl: `https://www.themoviedb.org/person/${row.id}` };
    const previous = unique.get(externalId);
    if (previous && previous.name !== ref.name) throw new Error("CONFLICTING_TMDB_DIRECTOR");
    if (!previous) unique.set(externalId, ref);
  }
  return [...unique.values()];
}
