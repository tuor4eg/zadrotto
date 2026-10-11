import { and, eq, getTableName, inArray, isNotNull, notInArray, or, sql, type SQLWrapper } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { normalizeSearchSql } from "@/db/search";
import { publishedSeriesMembershipSql } from "@/db/queries/series-membership";
import { genres, mediaItemGenres, mediaItems, providerGenreExclusions, providerGenreMappings } from "@/db/schema";
import {
  extractExternalGenres, resolveGenreMappings,
  type ExternalGenre, type MediaItemGenre,
} from "@/lib/media/genres";

export type GenreTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeGenreNameSql(value: Parameters<typeof normalizeSearchSql>[0]) {
  // The shared helper collapses whitespace after btrim; trim once more to cover
  // tabs/newlines at the boundaries, just as normalizeSearchText does.
  return sql<string>`btrim(${normalizeSearchSql(value)})`;
}

function qualifiedColumn(column: AnyPgColumn) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

export function visibleGenreSql(mediaItemId: SQLWrapper, replacementFranchiseId: SQLWrapper) {
  return sql<boolean>`(${replacementFranchiseId} is null or not ${publishedSeriesMembershipSql(mediaItemId, replacementFranchiseId)})`;
}

export function missingGenreSeriesBindingSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  const itemId = qualifiedColumn(mediaItemId);
  return sql<boolean>`exists (
    select 1 from ${mediaItemGenres} missing_genre_link
    inner join ${genres} missing_genre on missing_genre.id = missing_genre_link.genre_id
    where missing_genre_link.media_item_id = ${itemId} and missing_genre.is_active = true
      and missing_genre.replacement_franchise_id is not null
      and ${visibleGenreSql(itemId, sql`missing_genre.replacement_franchise_id`)}
  )`;
}

export function hasUnifiedGenresSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  return sql<boolean>`exists (select 1 from ${mediaItemGenres} unified_link
    inner join ${genres} unified_genre on unified_genre.id = unified_link.genre_id
    where unified_link.media_item_id = ${qualifiedColumn(mediaItemId)} and unified_genre.is_active = true)`;
}

export function publicMediaItemGenresJsonSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  return mediaItemGenresJsonSql(mediaItemId, true);
}

export function mediaItemGenresJsonSql(mediaItemId: AnyPgColumn = mediaItems.id, visibleOnly = false) {
  // Drizzle strips column qualifiers in single-table selects. Keep the outer
  // reference explicitly qualified so it cannot bind to genre.id in the subquery.
  const qualifiedId = qualifiedColumn(mediaItemId);
  return sql<MediaItemGenre[]>`coalesce((
    select jsonb_agg(jsonb_build_object('id', genre.id, 'slug', genre.slug, 'name', genre.name)
      order by genre.slug collate "C", genre.id)
    from ${mediaItemGenres} genre_link
    inner join ${genres} genre on genre.id = genre_link.genre_id
    where genre_link.media_item_id = ${qualifiedId} and genre.is_active = true
      ${visibleOnly ? sql`and ${visibleGenreSql(qualifiedId, sql`genre.replacement_franchise_id`)}` : sql``}
  ), '[]'::jsonb)`;
}

export async function resolveProviderGenres(input: {
  facts: Record<string, unknown>;
  provider: string | null;
  mediaType: string;
}, executor: Pick<typeof db, "select"> = db) {
  const externalGenres = extractExternalGenres(input.facts);
  const ids = externalGenres.flatMap((genre) => genre.id === null ? [] : [genre.id]);
  const exclusions = input.provider && externalGenres.length > 0 ? await executor.select({
    name: providerGenreExclusions.normalizedExternalGenreName,
  }).from(providerGenreExclusions).where(and(
    eq(providerGenreExclusions.provider, input.provider), eq(providerGenreExclusions.mediaType, input.mediaType),
    inArray(providerGenreExclusions.normalizedExternalGenreName, externalGenres.map((genre) => genre.normalizedName)),
  )) : [];
  const excludedNames = new Set(exclusions.map((row) => row.name));
  const rows = input.provider && externalGenres.length > 0 ? await executor.select({
    externalGenreId: providerGenreMappings.externalGenreId,
    normalizedExternalGenreName: providerGenreMappings.normalizedExternalGenreName,
    id: genres.id, slug: genres.slug, name: genres.name, isActive: genres.isActive,
  }).from(providerGenreMappings)
    .innerJoin(genres, eq(genres.id, providerGenreMappings.genreId))
    .where(and(
      eq(providerGenreMappings.provider, input.provider),
      eq(providerGenreMappings.mediaType, input.mediaType),
      or(
        inArray(providerGenreMappings.normalizedExternalGenreName, externalGenres.map((genre) => genre.normalizedName)),
        ids.length > 0 ? inArray(providerGenreMappings.externalGenreId, ids) : undefined,
      ),
    )) : [];
  return resolveGenreMappings({
    ...input, externalGenres: externalGenres.filter((genre) => !excludedNames.has(genre.normalizedName)), excludedNames: [],
    mappings: rows.map(({ id, slug, name, ...row }) => ({ ...row, genre: { id, slug, name } })),
  });
}

/** Caller holds the media_items row lock. Preserve manual assignments on every sync. */
export async function syncMediaItemProviderGenres(tx: GenreTransaction, input: {
  mediaItemId: number;
  provider: string | null;
  genres: readonly MediaItemGenre[];
}) {
  const staleCondition = and(
    eq(mediaItemGenres.mediaItemId, input.mediaItemId),
    isNotNull(mediaItemGenres.provider),
    input.provider && input.genres.length > 0
      ? notInArray(mediaItemGenres.genreId, input.genres.map((genre) => genre.id))
      : undefined,
  );
  await tx.delete(mediaItemGenres).where(and(staleCondition, eq(mediaItemGenres.isManual, false)));
  await tx.update(mediaItemGenres).set({ provider: null, updatedAt: new Date() })
    .where(and(staleCondition, eq(mediaItemGenres.isManual, true)));
  if (input.provider && input.genres.length > 0) {
    await tx.insert(mediaItemGenres).values(input.genres.map((genre) => ({
      mediaItemId: input.mediaItemId, genreId: genre.id, provider: input.provider,
    }))).onConflictDoUpdate({
      target: [mediaItemGenres.mediaItemId, mediaItemGenres.genreId],
      set: { provider: input.provider, updatedAt: new Date() },
      setWhere: sql`${mediaItemGenres.provider} is distinct from ${input.provider}`,
    });
  }
}

export function hasNewUnmappedGenres(input: {
  unmapped: readonly ExternalGenre[];
  provider: string | null;
  previousProvider: string | null;
  previousFacts: Record<string, unknown> | null;
}) {
  if (input.unmapped.length === 0) return false;
  if (input.provider !== input.previousProvider || input.previousFacts === null) return true;
  try {
    const previous = new Set(extractExternalGenres(input.previousFacts).map((genre) => `${genre.normalizedName}\0${genre.id ?? ""}`));
    return input.unmapped.some((genre) => !previous.has(`${genre.normalizedName}\0${genre.id ?? ""}`));
  } catch {
    return true;
  }
}
