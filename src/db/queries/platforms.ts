import { eligibleImportedPlatformLogoSql } from "@/db/queries/platform-logos";
import { resolvePlatformLogoUrl } from "@/lib/platforms/logo-url";
import { ARCHIVE_SEARCH_MATCH_LIMIT } from "@/lib/archive/search-matches";
import { containsNormalizedSearchSql } from "@/db/search";
import { normalizeSearchText } from "@/lib/search/normalize";
import { paginatePublicPlatforms } from "@/lib/media/public-platforms";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { platforms, platformRequests, jobRuns, mediaItemPlatforms, mediaItems, mediaTypes, providerPlatformMappings } from "@/db/schema";
import { groupPlatformProviderVariants, parsePlatformName } from "@/lib/media/admin-platforms";

async function getPlatformsWithVariants(id?: number | number[]) {
  if (Array.isArray(id) && !id.length) return [];
  const [rows, variants] = await Promise.all([
    db.select({
      id: platforms.id, slug: platforms.slug, name: platforms.name, isActive: platforms.isActive,
      importedLogoProvider: platforms.importedLogoProvider, importedLogoExternalId: platforms.importedLogoExternalId,
      logoMode: platforms.logoMode, logoVersion: platforms.logoVersion, manualLogoObjectKey: platforms.manualLogoObjectKey, importedLogoObjectKey: eligibleImportedPlatformLogoSql(),
      mediaItemsCount: sql<number>`(select count(*)::int from ${mediaItemPlatforms} platform_link
        where platform_link.platform_id = "platforms"."id")`,
    }).from(platforms)
      .where(id === undefined ? undefined : Array.isArray(id) ? inArray(platforms.id, id) : eq(platforms.id, id))
      .orderBy(asc(platforms.name), asc(platforms.id)),
    db.select({
      mappingId: providerPlatformMappings.id,
      applying: sql<boolean>`exists (select 1 from ${platformRequests} left join ${jobRuns} on ${jobRuns.id} = ${platformRequests.jobRunId}
        where ${platformRequests.kind} = 'mapping' and ${platformRequests.provider} = ${providerPlatformMappings.provider}
        and ${platformRequests.mediaType} = ${providerPlatformMappings.mediaType}
        and ${platformRequests.normalizedExternalPlatformName} = ${providerPlatformMappings.normalizedExternalPlatformName}
        and (${jobRuns.status} in ('queued', 'running') or (${platformRequests.jobRunId} is null and ${platformRequests.applyStatus} = 'applying')))`,
      platformId: providerPlatformMappings.platformId, provider: providerPlatformMappings.provider,
      mediaType: providerPlatformMappings.mediaType, mediaTypeName: mediaTypes.name,
      externalPlatformName: providerPlatformMappings.externalPlatformName,
    }).from(providerPlatformMappings)
      .innerJoin(mediaTypes, eq(mediaTypes.code, providerPlatformMappings.mediaType))
      .where(id === undefined ? undefined : Array.isArray(id) ? inArray(providerPlatformMappings.platformId, id) : eq(providerPlatformMappings.platformId, id)),
  ]);
  const variantsByPlatform = new Map<number, typeof variants>();
  for (const variant of variants) {
    const group = variantsByPlatform.get(variant.platformId) ?? [];
    group.push(variant);
    variantsByPlatform.set(variant.platformId, group);
  }
  return rows.map((row) => ({
    ...row, logoUrl: resolvePlatformLogoUrl(row), providerVariants: groupPlatformProviderVariants(variantsByPlatform.get(row.id) ?? []),
  }));
}

export type AdminPlatform = Awaited<ReturnType<typeof getAdminPlatforms>>[number];

export async function getAdminPlatforms() {
  return getPlatformsWithVariants();
}

export async function getAdminPlatformsPage(input: { searchQuery: string; page: number }) {
  const search = normalizeSearchText(input.searchQuery);
  const filter = and(eq(platforms.isActive, true), search ? or(
    containsNormalizedSearchSql(platforms.name, search),
    containsNormalizedSearchSql(platforms.slug, search),
    sql`exists (select 1 from ${providerPlatformMappings} where ${providerPlatformMappings.platformId} = ${platforms.id}
      and ${containsNormalizedSearchSql(providerPlatformMappings.externalPlatformName, search)})`,
  ) : undefined);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(platforms).where(filter);
  const total = count.total;
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Number.isSafeInteger(input.page) && input.page > 0 ? input.page : 1);
  const ids = await db.select({ id: platforms.id }).from(platforms).where(filter)
    .orderBy(asc(platforms.name), asc(platforms.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { items: await getPlatformsWithVariants(ids.map((row) => row.id)), total, page, totalPages };
}

export async function getAdminPlatformById(id: number) {
  return (await getPlatformsWithVariants(id))[0] ?? null;
}

export async function updatePlatformName(id: number, name: string) {
  const normalizedName = parsePlatformName(name);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647 || !normalizedName) throw new Error("Invalid platform name or ID");
  const [platform] = await db.update(platforms).set({ name: normalizedName, updatedAt: new Date() })
    .where(eq(platforms.id, id)).returning({ id: platforms.id });
  return platform ?? null;
}

export async function getPublicPlatformsPage(input: {
  enabledMediaTypeCodes: readonly string[]; letter?: string; page: number; pageSize: number; searchQuery: string;
}) {
  if (!input.enabledMediaTypeCodes.includes("game")) return paginatePublicPlatforms([], input);
  const search = normalizeSearchText(input.searchQuery);
  const rows = await db.select({ id: platforms.id, slug: platforms.slug, name: platforms.name,
    importedLogoProvider: platforms.importedLogoProvider, importedLogoExternalId: platforms.importedLogoExternalId,
      logoMode: platforms.logoMode, manualLogoObjectKey: platforms.manualLogoObjectKey, importedLogoObjectKey: eligibleImportedPlatformLogoSql(),
    mediaItemsCount: sql<number>`count(${mediaItems.id})::int`,
    nameMatches: search ? sql<boolean>`${containsNormalizedSearchSql(platforms.name, search)}` : sql<boolean>`true`,
  }).from(platforms).innerJoin(mediaItemPlatforms, eq(mediaItemPlatforms.platformId, platforms.id))
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemPlatforms.mediaItemId))
    .where(and(eq(platforms.isActive, true), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      eq(mediaItems.mediaType, "game"),
      inArray(mediaItems.mediaType, [...input.enabledMediaTypeCodes])))
    .groupBy(platforms.id);
  return paginatePublicPlatforms(rows.map(row => ({ ...row, logoUrl: resolvePlatformLogoUrl(row) })), input);
}

export async function getActivePlatformBySlug(slug: string) {
  const [platform] = await db.select({ id: platforms.id, slug: platforms.slug, name: platforms.name,
    logoMode: platforms.logoMode, manualLogoObjectKey: platforms.manualLogoObjectKey,
    importedLogoObjectKey: eligibleImportedPlatformLogoSql(), }).from(platforms)
    .where(and(eq(platforms.slug, slug), eq(platforms.isActive, true))).limit(1);
  return platform ? { id: platform.id, slug: platform.slug, name: platform.name, logoUrl: resolvePlatformLogoUrl(platform) } : null;
}

export async function searchArchivePlatformMatches(searchQuery: string, enabledMediaTypeCodes: readonly string[]) {
  if (!normalizeSearchText(searchQuery) || !enabledMediaTypeCodes.length) {
    return { items: [] as import("@/lib/media/public-platforms").PublicPlatform[], totalCount: 0 };
  }
  const page = await getPublicPlatformsPage({
    enabledMediaTypeCodes, searchQuery, page: 1, pageSize: ARCHIVE_SEARCH_MATCH_LIMIT,
  });
  return { items: page.items, totalCount: page.paginationTotalCount };
}

export const updatePlatform = updatePlatformName;
