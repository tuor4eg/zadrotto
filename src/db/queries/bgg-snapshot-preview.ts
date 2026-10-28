import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { genres, mediaItemGenres, genreRequests, genreRequestMediaItems,
  creatorRequests, creatorRequestMediaItems, creatorRoles } from "@/db/schema";
import { resolveProviderGenres } from "./media-item-genres";
import { BGG_FACT_KEYS, type normalizeBggSnapshot } from "@/lib/providers/bgg-adapter";
import { normalizeSearchText } from "@/lib/search/normalize";

/** Compare like-for-like: local genre mappings and observed BGG identities, not raw storage keys. */
export async function getBggSnapshotPreview(id: number, facts: Record<string,unknown>, projection: ReturnType<typeof normalizeBggSnapshot>) {
  const [resolution, genreLinks, pendingGenres, participants] = await Promise.all([
    resolveProviderGenres({facts:projection.genreFacts,provider:"bgg",mediaType:"boardgame"}),
    db.select({id:genres.id,name:genres.name,manual:mediaItemGenres.isManual}).from(mediaItemGenres)
      .innerJoin(genres,eq(genres.id,mediaItemGenres.genreId))
      .where(and(eq(mediaItemGenres.mediaItemId,id),eq(genres.isActive,true))),
    db.select({id:genreRequestMediaItems.externalGenreId,name:genreRequestMediaItems.externalGenreName})
      .from(genreRequestMediaItems).innerJoin(genreRequests,eq(genreRequests.id,genreRequestMediaItems.requestId))
      .where(and(eq(genreRequestMediaItems.mediaItemId,id),eq(genreRequests.provider,"bgg"),eq(genreRequests.mediaType,"boardgame"))),
    db.select({externalId:creatorRequests.externalCreatorId,name:creatorRequestMediaItems.externalCreatorName,roleCode:creatorRoles.code})
      .from(creatorRequestMediaItems).innerJoin(creatorRequests,eq(creatorRequests.id,creatorRequestMediaItems.requestId))
      .innerJoin(creatorRoles,eq(creatorRoles.id,creatorRequestMediaItems.roleId))
      .where(and(eq(creatorRequestMediaItems.mediaItemId,id),eq(creatorRequests.provider,"bgg"),eq(creatorRequests.mediaType,"boardgame"))),
  ]);
  const currentParticipants = participants.filter(row => row.externalId !== null);
  const existingNames = new Map(currentParticipants.map(row => [row.externalId,row.name]));
  const expectedGenres = new Map(resolution.genres.map(row => [row.id,{id:row.id,name:row.name}]));
  for (const row of genreLinks) if (row.manual) expectedGenres.set(row.id,{id:row.id,name:row.name});
  const unresolvedIds = new Set(resolution.unmapped.map(row => row.id));
  const unresolvedNames = new Set(resolution.unmapped.map(row => row.normalizedName));
  const currentUnmapped = pendingGenres.filter(row => row.id !== null ? unresolvedIds.has(row.id) : unresolvedNames.has(normalizeSearchText(row.name)));
  const compact = (values: Record<string,unknown>) => Object.fromEntries(BGG_FACT_KEYS.filter(key => values[key] !== null && values[key] !== undefined).map(key => [key,values[key]]));
  return {
    current:{характеристики:compact(facts),жанры:genreLinks.map(({id,name})=>({id,name})),
      "жанры без соответствий":currentUnmapped,участники:currentParticipants},
    proposed:{характеристики:compact(projection.facts),жанры:[...expectedGenres.values()],
      "жанры без соответствий":resolution.unmapped.map(row=>({id:row.id,name:row.name})),
      участники:projection.creatorReferences.map(row=>({...row,name:existingNames.get(row.externalId) ?? row.name}))},
  };
}
