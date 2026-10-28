import { extractGameCompanyReferences } from "@/lib/creators/game-companies";
import { getIgdbCompanyReferences, getRawgCompanyReferences } from "@/lib/creators/game-company-references";
import { getProviderGenreReferences } from "@/lib/media/genres";
import type { RawSnapshot, SnapshotDescriptor } from "./types";

export type GameSnapshotProvider = "igdb" | "rawg";
export const IGDB_GAME_SNAPSHOT_FIELDS = "name,summary,slug,url,first_release_date,rating,total_rating,cover.image_id,cover.width,cover.height,genres.id,genres.name,involved_companies.company.id,involved_companies.company.name,involved_companies.company.url,involved_companies.developer,involved_companies.publisher,platforms.id,platforms.name,screenshots.id,screenshots.image_id,screenshots.url,screenshots.width,screenshots.height,artworks.id,artworks.image_id,artworks.url,artworks.width,artworks.height,release_dates.date,release_dates.platform.id";
export const GAME_LEGACY_FACT_KEYS = ["genres", "genreReferences", "platforms", "developers", "publishers", "gameCompanyReferences"] as const;

export function describeGameSource(provider: GameSnapshotProvider, externalId: string): SnapshotDescriptor {
  if ((provider !== "igdb" && provider !== "rawg") || !/^[1-9]\d*$/.test(externalId) || !Number.isSafeInteger(Number(externalId))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { providerCode: provider, resourceType: "game", externalId,
    apiMethod: provider === "igdb" ? "games.details" : "game.details",
    requestParams: provider === "igdb" ? { version: 1, fields: IGDB_GAME_SNAPSHOT_FIELDS } : { version: 1 } };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function rows(value: unknown, optional = false): Record<string, unknown>[] {
  // IGDB leaves absent/empty fields out of an otherwise complete expanded response.
  if (value === undefined && optional) return [];
  if (!Array.isArray(value) || value.some(row => !record(row))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return value as Record<string, unknown>[];
}
function namedRows(value: unknown, optional = false) {
  const values = rows(value, optional);
  if (values.some(row => typeof row.name !== "string" || !row.name.trim() || (row.id !== undefined && (!Number.isSafeInteger(row.id) || Number(row.id) <= 0)))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  return values as Array<{ id?: number; name: string }>;
}
function names(values: Array<{ name: string }>) { return [...new Set(values.map(row => row.name.trim()).filter(Boolean))]; }

export function normalizeGameSnapshot(snapshot: Pick<RawSnapshot, "providerCode" | "externalId" | "payload">) {
  if (snapshot.providerCode !== "igdb" && snapshot.providerCode !== "rawg") throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const provider = snapshot.providerCode;
  describeGameSource(provider, snapshot.externalId);
  const payload = snapshot.payload;
  const game = provider === "igdb" ? (Array.isArray(payload) && payload.length === 1 ? record(payload[0]) : null) : record(payload);
  if (!game || game.id !== Number(snapshot.externalId)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  if (typeof game.name !== "string" || !game.name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  const genres = namedRows(game.genres, provider === "igdb");
  const platforms = provider === "igdb" ? namedRows(game.platforms, true) : rows(game.platforms).map(row => {
    const platform = record(row.platform);
    if (!platform || typeof platform.name !== "string" || !platform.name.trim()) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    return { name: platform.name };
  });
  let companyReferences;
  if (provider === "igdb") {
    for (const key of ["screenshots", "artworks"] as const) {
      if (rows(game[key], true).some(row => !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || (row.image_id !== undefined && typeof row.image_id !== "string") || (row.url !== undefined && typeof row.url !== "string") || [row.width, row.height].some(value => value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    }
    if (rows(game.release_dates, true).some(row => (row.date !== undefined && (typeof row.date !== "number" || !Number.isFinite(row.date))) || (row.platform !== undefined && (!record(row.platform) || !Number.isSafeInteger(record(row.platform)!.id) || Number(record(row.platform)!.id) <= 0)))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    const companies = rows(game.involved_companies, true);
    if (companies.some(row => (row.developer !== undefined && typeof row.developer !== "boolean") || (row.publisher !== undefined && typeof row.publisher !== "boolean") || !record(row.company) || !Number.isSafeInteger(record(row.company)!.id) || Number(record(row.company)!.id) <= 0 || typeof record(row.company)!.name !== "string" || !(record(row.company)!.name as string).trim())) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    companyReferences = getIgdbCompanyReferences(companies as Parameters<typeof getIgdbCompanyReferences>[0]);
  } else {
    const developers = namedRows(game.developers);
    const publishers = namedRows(game.publishers);
    companyReferences = getRawgCompanyReferences({ developers, publishers });
  }
  if (companyReferences === undefined) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  companyReferences = extractGameCompanyReferences({ gameCompanyReferences: companyReferences }, provider)!;
  const genreReferences = getProviderGenreReferences(genres);
  const sourceUrl = provider === "igdb"
    ? typeof game.url === "string" ? game.url : typeof game.slug === "string" ? `https://www.igdb.com/games/${game.slug}` : null
    : `https://rawg.io/games/${typeof game.slug === "string" && game.slug ? game.slug : snapshot.externalId}`;
  const releaseYear = provider === "igdb"
    ? typeof game.first_release_date === "number" && Number.isFinite(game.first_release_date) && Math.abs(game.first_release_date) < 8.64e12 ? new Date(game.first_release_date * 1000).getUTCFullYear() : undefined
    : typeof game.released === "string" && /^\d{4}-/.test(game.released) ? Number(game.released.slice(0, 4)) : undefined;
  const description = provider === "igdb" ? game.summary : game.description_raw;
  return { provider, externalId: snapshot.externalId, sourceUrl, facts: {} as Record<string, unknown>,
    genreFacts: { genres: names(genres), ...(genreReferences.length ? { genreReferences } : {}) },
    platformFacts: { platforms: names(platforms) }, companyReferences,
    fields: { title: game.name, ...(Number.isInteger(releaseYear) ? { releaseYear } : {}), ...(typeof description === "string" && description.trim() ? { description } : {}) } };
}
