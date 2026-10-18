import { and, eq, getTableName, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { normalizeSearchSql } from "@/db/search";
import { platforms, mediaItemPlatforms, mediaItems, providerPlatformExclusions, providerPlatformMappings } from "@/db/schema";
import {
  extractExternalPlatforms, resolvePlatformMappings,
  type ExternalPlatform, type MediaItemPlatform,
} from "@/lib/media/platforms";

export type PlatformTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizePlatformNameSql(value: Parameters<typeof normalizeSearchSql>[0]) {
  // The shared helper collapses whitespace after btrim; trim once more to cover
  // tabs/newlines at the boundaries, just as normalizeSearchText does.
  return sql<string>`btrim(${normalizeSearchSql(value)})`;
}

function qualifiedColumn(column: AnyPgColumn) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

export function hasUnifiedPlatformsSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  return sql<boolean>`exists (select 1 from ${mediaItemPlatforms} unified_link
    inner join ${platforms} unified_platform on unified_platform.id = unified_link.platform_id
    where unified_link.media_item_id = ${qualifiedColumn(mediaItemId)} and unified_platform.is_active = true)`;
}

export function publicMediaItemPlatformsJsonSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  return mediaItemPlatformsJsonSql(mediaItemId);
}

export function mediaItemPlatformsJsonSql(mediaItemId: AnyPgColumn = mediaItems.id) {
  // Drizzle strips column qualifiers in single-table selects. Keep the outer
  // reference explicitly qualified so it cannot bind to platform.id in the subquery.
  const qualifiedId = qualifiedColumn(mediaItemId);
  return sql<MediaItemPlatform[]>`coalesce((
    select jsonb_agg(jsonb_build_object('id', platform.id, 'slug', platform.slug, 'name', platform.name)
      order by platform.slug collate "C", platform.id)
    from ${mediaItemPlatforms} platform_link
    inner join ${platforms} platform on platform.id = platform_link.platform_id
    where platform_link.media_item_id = ${qualifiedId} and platform.is_active = true
  ), '[]'::jsonb)`;
}

export async function resolveProviderPlatforms(input: {
  facts: Record<string, unknown>;
  provider: string | null;
  mediaType: string;
}, executor: Pick<typeof db, "select"> = db) {
  const externalPlatforms = input.mediaType === "game" ? extractExternalPlatforms(input.facts) : [];
  const exclusions = input.provider && externalPlatforms.length > 0 ? await executor.select({
    name: providerPlatformExclusions.normalizedExternalPlatformName,
  }).from(providerPlatformExclusions).where(and(
    eq(providerPlatformExclusions.provider, input.provider), eq(providerPlatformExclusions.mediaType, input.mediaType),
    inArray(providerPlatformExclusions.normalizedExternalPlatformName, externalPlatforms.map((platform) => platform.normalizedName)),
  )) : [];
  const excludedNames = new Set(exclusions.map((row) => row.name));
  const rows = input.provider && externalPlatforms.length > 0 ? await executor.select({
    normalizedExternalPlatformName: providerPlatformMappings.normalizedExternalPlatformName,
    id: platforms.id, slug: platforms.slug, name: platforms.name, isActive: platforms.isActive,
  }).from(providerPlatformMappings)
    .innerJoin(platforms, eq(platforms.id, providerPlatformMappings.platformId))
    .where(and(
      eq(providerPlatformMappings.provider, input.provider),
      eq(providerPlatformMappings.mediaType, input.mediaType),
      inArray(providerPlatformMappings.normalizedExternalPlatformName, externalPlatforms.map((platform) => platform.normalizedName)),
    )) : [];
  return resolvePlatformMappings({
    ...input, externalPlatforms: externalPlatforms.filter((platform) => !excludedNames.has(platform.normalizedName)), excludedNames: [],
    mappings: rows.map(({ id, slug, name, ...row }) => ({ ...row, platform: { id, slug, name } })),
  });
}

/** Caller holds the media_items row lock. Preserve manual assignments on every sync. */
export async function syncMediaItemProviderPlatforms(tx: PlatformTransaction, input: {
  mediaItemId: number;
  provider: string | null;
  platforms: readonly MediaItemPlatform[];
}) {
  const staleCondition = and(
    eq(mediaItemPlatforms.mediaItemId, input.mediaItemId),
    isNotNull(mediaItemPlatforms.provider),
    input.provider && input.platforms.length > 0
      ? notInArray(mediaItemPlatforms.platformId, input.platforms.map((platform) => platform.id))
      : undefined,
  );
  await tx.delete(mediaItemPlatforms).where(and(staleCondition, eq(mediaItemPlatforms.isManual, false)));
  await tx.update(mediaItemPlatforms).set({ provider: null, updatedAt: new Date() })
    .where(and(staleCondition, eq(mediaItemPlatforms.isManual, true)));
  if (input.provider && input.platforms.length > 0) {
    await tx.insert(mediaItemPlatforms).values(input.platforms.map((platform) => ({
      mediaItemId: input.mediaItemId, platformId: platform.id, provider: input.provider,
    }))).onConflictDoUpdate({
      target: [mediaItemPlatforms.mediaItemId, mediaItemPlatforms.platformId],
      set: { provider: input.provider, updatedAt: new Date() },
      setWhere: sql`${mediaItemPlatforms.provider} is distinct from ${input.provider}`,
    });
  }
}

export function hasNewUnmappedPlatforms(input: {
  unmapped: readonly ExternalPlatform[];
  provider: string | null;
  previousProvider: string | null;
  previousFacts: Record<string, unknown> | null;
}) {
  if (input.unmapped.length === 0) return false;
  if (input.provider !== input.previousProvider || input.previousFacts === null) return true;
  try {
    const previous = new Set(extractExternalPlatforms(input.previousFacts).map((platform) => platform.normalizedName));
    return input.unmapped.some((platform) => !previous.has(platform.normalizedName));
  } catch {
    return true;
  }
}
