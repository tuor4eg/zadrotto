import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { genres, platforms, mediaItemGenres, mediaItemPlatforms, gameCompanyRosters,
  genreRequests, genreRequestMediaItems, platformRequests, platformRequestMediaItems } from "@/db/schema";
import { resolveProviderGenres } from "./media-item-genres";
import { resolveProviderPlatforms } from "./media-item-platforms";
import type { normalizeGameSnapshot } from "@/lib/providers/game-adapter";
import { normalizeSearchText } from "@/lib/search/normalize";

/** Compare working identities after mappings and exclusions, rather than raw display strings. */
export async function getGameSnapshotPreview(id: number, projection: ReturnType<typeof normalizeGameSnapshot>) {
  const provider = projection.provider;
  const [genreResolution, platformResolution, genreLinks, platformLinks, pendingGenres, pendingPlatforms, rosters] = await Promise.all([
    resolveProviderGenres({ facts: projection.genreFacts, provider, mediaType: "game" }),
    resolveProviderPlatforms({ facts: projection.platformFacts, provider, mediaType: "game" }),
    db.select({ id: genres.id, name: genres.name, manual: mediaItemGenres.isManual }).from(mediaItemGenres)
      .innerJoin(genres, eq(genres.id, mediaItemGenres.genreId)).where(eq(mediaItemGenres.mediaItemId, id)),
    db.select({ id: platforms.id, name: platforms.name, manual: mediaItemPlatforms.isManual }).from(mediaItemPlatforms)
      .innerJoin(platforms, eq(platforms.id, mediaItemPlatforms.platformId)).where(eq(mediaItemPlatforms.mediaItemId, id)),
    db.select({ name: genreRequests.normalizedExternalGenreName }).from(genreRequestMediaItems)
      .innerJoin(genreRequests, eq(genreRequests.id, genreRequestMediaItems.requestId))
      .where(and(eq(genreRequestMediaItems.mediaItemId, id), eq(genreRequests.provider, provider), eq(genreRequests.mediaType, "game"))),
    db.select({ name: platformRequests.normalizedExternalPlatformName }).from(platformRequestMediaItems)
      .innerJoin(platformRequests, eq(platformRequests.id, platformRequestMediaItems.requestId))
      .where(and(eq(platformRequestMediaItems.mediaItemId, id), eq(platformRequests.provider, provider), eq(platformRequests.mediaType, "game"))),
    db.select().from(gameCompanyRosters).where(and(eq(gameCompanyRosters.mediaItemId, id), eq(gameCompanyRosters.provider, provider))),
  ]);
  const assignments = (current: { id: number; name: string; manual: boolean }[], resolved: { id: number; name: string }[]) => {
    const expected = new Map(resolved.map(({ id, name }) => [id, { id, name }]));
    for (const row of current) if (row.manual) expected.set(row.id, { id: row.id, name: row.name });
    return { current: current.map(({ id, name }) => ({ id, name })), proposed: [...expected.values()] };
  };
  const unresolved = (pending: { name: string }[], values: { normalizedName: string }[]) => {
    const known = new Set(pending.map(row => row.name));
    const proposed = values.map(row => row.normalizedName);
    return { current: proposed.filter(name => known.has(name)), proposed };
  };
  const genre = assignments(genreLinks, genreResolution.genres);
  const platform = assignments(platformLinks, platformResolution.platforms);
  const unknownGenres = unresolved(pendingGenres, genreResolution.unmapped);
  const unknownPlatforms = unresolved(pendingPlatforms, platformResolution.unmapped);
  const companies = (rows: typeof projection.companyReferences) => rows.map(({ externalId, roleCode, name }) => ({ externalId, roleCode, name: normalizeSearchText(name) }));
  return {
    current: { жанры: genre.current, платформы: platform.current, компании: companies(rosters[0]?.references ?? []),
      "жанры без соответствий": unknownGenres.current, "платформы без соответствий": unknownPlatforms.current },
    proposed: { жанры: genre.proposed, платформы: platform.proposed, компании: companies(projection.companyReferences),
      "жанры без соответствий": unknownGenres.proposed, "платформы без соответствий": unknownPlatforms.proposed },
  };
}
