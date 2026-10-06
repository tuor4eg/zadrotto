import { ARCHIVE_SEARCH_MATCH_LIMIT } from "@/lib/archive/search-matches";
import { containsNormalizedSearchSql } from "@/db/search";
import { normalizeSearchText } from "@/lib/search/normalize";
import { paginatePublicGenres } from "@/lib/media/public-genres";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { genres, mediaItemGenres, mediaItems, mediaTypes, providerGenreMappings } from "@/db/schema";
import { groupGenreProviderVariants, parseGenreName } from "@/lib/media/admin-genres";

async function getGenresWithVariants(id?: number) {
  const [rows, variants] = await Promise.all([
    db.select({
      id: genres.id, slug: genres.slug, name: genres.name, isActive: genres.isActive,
      mediaItemsCount: sql<number>`(select count(*)::int from ${mediaItemGenres} genre_link
        where genre_link.genre_id = "genres"."id")`,
    }).from(genres).where(id === undefined ? undefined : eq(genres.id, id))
      .orderBy(asc(genres.name), asc(genres.id)),
    db.select({
      genreId: providerGenreMappings.genreId, provider: providerGenreMappings.provider,
      mediaType: providerGenreMappings.mediaType, mediaTypeName: mediaTypes.name,
      externalGenreName: providerGenreMappings.externalGenreName,
    }).from(providerGenreMappings)
      .innerJoin(mediaTypes, eq(mediaTypes.code, providerGenreMappings.mediaType))
      .where(id === undefined ? undefined : eq(providerGenreMappings.genreId, id)),
  ]);
  const variantsByGenre = new Map<number, typeof variants>();
  for (const variant of variants) {
    const group = variantsByGenre.get(variant.genreId) ?? [];
    group.push(variant);
    variantsByGenre.set(variant.genreId, group);
  }
  return rows.map((row) => ({
    ...row, providerVariants: groupGenreProviderVariants(variantsByGenre.get(row.id) ?? []),
  }));
}

export type AdminGenre = Awaited<ReturnType<typeof getAdminGenres>>[number];

export async function getAdminGenres() {
  return getGenresWithVariants();
}

export async function getAdminGenreById(id: number) {
  return (await getGenresWithVariants(id))[0] ?? null;
}

export async function updateGenreName(id: number, name: string) {
  const normalizedName = parseGenreName(name);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647 || !normalizedName) throw new Error("Invalid genre name or ID");
  const [genre] = await db.update(genres).set({ name: normalizedName, updatedAt: new Date() })
    .where(eq(genres.id, id)).returning({ id: genres.id });
  return genre ?? null;
}


export async function getPublicGenresPage(input: {
  enabledMediaTypeCodes: readonly string[]; letter?: string; page: number; pageSize: number; searchQuery: string;
}) {
  if (!input.enabledMediaTypeCodes.length) return paginatePublicGenres([], input);
  const search = normalizeSearchText(input.searchQuery);
  const rows = await db.select({ id: genres.id, slug: genres.slug, name: genres.name,
    mediaItemsCount: sql<number>`count(${mediaItems.id})::int`,
    nameMatches: search ? sql<boolean>`${containsNormalizedSearchSql(genres.name, search)}` : sql<boolean>`true`,
  }).from(genres).innerJoin(mediaItemGenres, eq(mediaItemGenres.genreId, genres.id))
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemGenres.mediaItemId))
    .where(and(eq(genres.isActive, true), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      inArray(mediaItems.mediaType, [...input.enabledMediaTypeCodes])))
    .groupBy(genres.id);
  return paginatePublicGenres(rows, input);
}

export async function getActiveGenreBySlug(slug: string) {
  const [genre] = await db.select({ id: genres.id, slug: genres.slug, name: genres.name }).from(genres)
    .where(and(eq(genres.slug, slug), eq(genres.isActive, true))).limit(1);
  return genre ?? null;
}

export async function searchArchiveGenreMatches(searchQuery: string, enabledMediaTypeCodes: readonly string[]) {
  if (!normalizeSearchText(searchQuery) || !enabledMediaTypeCodes.length) {
    return { items: [] as import("@/lib/media/public-genres").PublicGenre[], totalCount: 0 };
  }
  const page = await getPublicGenresPage({
    enabledMediaTypeCodes, searchQuery, page: 1, pageSize: ARCHIVE_SEARCH_MATCH_LIMIT,
  });
  return { items: page.items, totalCount: page.paginationTotalCount };
}
