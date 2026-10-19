import { saveGameCompanyRoster } from "./game-companies";
import { extractGameCompanyReferences, isGameCompanyProvider } from "@/lib/creators/game-companies";
import { gameCompanyRosters } from "@/db/schema";
import { syncProviderCreators } from "@/db/queries/creator-requests"
import { entryProviderWriterCreatorsJsonSql } from "@/db/queries/creators"
import type { TitlePartProviderInput } from "@/lib/media/title-parts"
import { syncProviderTitleParts } from "@/db/queries/title-parts-sync"
import { createJobRun } from "@/db/queries/jobs"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { mediaCarriers, mediaItemMetadata, mediaItems, titleParts } from "@/db/schema"
import type { MetadataIssueCode } from "@/lib/media/metadata-issue"
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status"
import { logSystemActivity } from "@/lib/activity-logs/system"
import { hasNewUnmappedGenres, mediaItemGenresJsonSql, resolveProviderGenres, syncMediaItemProviderGenres } from "@/db/queries/media-item-genres"
import { lockGenreRequestsForMetadata, syncGenreRequestOccurrences } from "@/db/queries/genre-requests"
import { extractExternalGenres } from "@/lib/media/genres"
import type { MediaItemGenre } from "@/lib/media/genres"
import { hasNewUnmappedPlatforms, mediaItemPlatformsJsonSql, resolveProviderPlatforms, syncMediaItemProviderPlatforms } from "@/db/queries/media-item-platforms"
import { lockPlatformRequestsForMetadata, syncPlatformRequestOccurrences } from "@/db/queries/platform-requests"
import { extractExternalPlatforms, type MediaItemPlatform } from "@/lib/media/platforms"

export type MediaItemMetadataFacts = Record<string, unknown>;

export type MediaItemMetadataValue = {
  mediaItemId: number;
  facts: MediaItemMetadataFacts;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  fetchedAt: Date | null;
  updatedAt: Date;
  genres: MediaItemGenre[];
  platforms: MediaItemPlatform[];
  writerCreators?: { id: number; name: string; slug: string }[];
};

export type UpsertMediaItemMetadataInput = {
  parts?: TitlePartProviderInput[];
  requestProviderParts?: boolean;
  mediaItemId: number;
  facts: MediaItemMetadataFacts;
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: Date | null;
};

function mapMediaItemMetadata(row: typeof mediaItemMetadata.$inferSelect, genres: MediaItemGenre[], platforms: MediaItemPlatform[], writerCreators?: { id: number; name: string; slug: string }[]): MediaItemMetadataValue {
  return {
    mediaItemId: row.mediaItemId,
    facts: row.facts,
    sourceProvider: row.sourceProvider,
    sourceExternalId: row.sourceExternalId,
    sourceUrl: row.sourceUrl,
    fetchedAt: row.fetchedAt,
    updatedAt: row.updatedAt,
    genres,
    platforms,
    writerCreators,
  };
}

export async function getMediaItemMetadata(
  mediaItemId: number,
): Promise<MediaItemMetadataValue | null> {
  const [row] = await db
    .select({ mediaType: mediaItems.mediaType, metadata: mediaItemMetadata, genres: mediaItemGenresJsonSql(mediaItemMetadata.mediaItemId), platforms: mediaItemPlatformsJsonSql(mediaItemMetadata.mediaItemId), writerCreators: entryProviderWriterCreatorsJsonSql(sql`"media_item_metadata"."media_item_id"`) })
    .from(mediaItemMetadata)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMetadata.mediaItemId))
    .where(eq(mediaItemMetadata.mediaItemId, mediaItemId))
    .limit(1);

  return row ? mapMediaItemMetadata(row.metadata, row.genres, row.platforms, row.mediaType === "book" ? row.writerCreators : undefined) : null;
}

export async function upsertMediaItemMetadata(
  input: UpsertMediaItemMetadataInput,
): Promise<MediaItemMetadataValue> {
  const now = new Date();
  const fetchedAt = input.fetchedAt === undefined ? now : input.fetchedAt;
  const provider = input.sourceProvider?.trim() || null;
  const result = await db.transaction(async (tx) => {
    const [item] = await tx.select({ mediaType: mediaItems.mediaType, title: mediaItems.title })
      .from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).for("update");
    if (!item) throw new Error("Media item not found");
    const [previous] = await tx.select().from(mediaItemMetadata)
      .where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId));
    await lockGenreRequestsForMetadata(tx, { mediaItemId: input.mediaItemId, facts: input.facts, provider, mediaType: item.mediaType });
    // Global order: media item → genre request keys → platform request keys.
    await lockPlatformRequestsForMetadata(tx, { mediaItemId: input.mediaItemId, facts: input.facts, provider, mediaType: item.mediaType });
    const resolved = await resolveProviderGenres({ facts: input.facts, provider, mediaType: item.mediaType }, tx);
    const resolvedPlatforms = await resolveProviderPlatforms({ facts: input.facts, provider, mediaType: item.mediaType }, tx);
    const [row] = await tx
      .insert(mediaItemMetadata)
      .values({
        mediaItemId: input.mediaItemId,
        facts: input.facts,
        sourceProvider: provider,
        sourceExternalId: input.sourceExternalId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        fetchedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: mediaItemMetadata.mediaItemId,
        set: {
          facts: input.facts,
          sourceProvider: provider,
          sourceExternalId: input.sourceExternalId ?? null,
          sourceUrl: input.sourceUrl ?? null,
          fetchedAt,
          updatedAt: now,
        },
      })
      .returning();

    const partsResult = input.parts !== undefined && provider
      ? await syncProviderTitleParts(tx, { mediaItemId: input.mediaItemId, provider, parts: input.parts })
      : { posters: [], conflicts: [] };
    for (const poster of partsResult.posters) {
      await createJobRun({ type: "media.title-part-poster", payload: poster, source: "event",
        maxAttempts: 3, retryBaseSeconds: 60, retryMaxSeconds: 3600, timeoutSeconds: 120 }, now, tx);
    }
    // Client candidates do not carry parts. Refresh the trusted provider response after source selection.
    if (input.requestProviderParts && provider === "tmdb" && item.mediaType === "series" && input.sourceExternalId) {
      await createJobRun({ type: "media.metadata-backfill", payload: { mediaItemId: input.mediaItemId, partsOnly: true }, source: "event",
        maxAttempts: 3, retryBaseSeconds: 60, retryMaxSeconds: 3600, timeoutSeconds: 300 }, now, tx);
    }

    await syncMediaItemProviderGenres(tx, { mediaItemId: input.mediaItemId, provider, genres: resolved.genres });
    await syncGenreRequestOccurrences(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType,
      externalGenres: extractExternalGenres(input.facts) });

    await syncMediaItemProviderPlatforms(tx, { mediaItemId: input.mediaItemId, provider, platforms: resolvedPlatforms.platforms });
    await syncPlatformRequestOccurrences(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType,
      externalPlatforms: item.mediaType === "game" ? extractExternalPlatforms(input.facts) : [] });

    if (Object.keys(input.facts).length > 0) {
      await tx.update(mediaItems).set({ metadataIssueCode: null })
        .where(eq(mediaItems.id, input.mediaItemId));
    }

    if (item.mediaType === "game" && isGameCompanyProvider(provider) && input.sourceExternalId) {
      const references = extractGameCompanyReferences(input.facts, provider);
      if (references !== null) await saveGameCompanyRoster(tx, { mediaItemId: input.mediaItemId, provider, sourceExternalId: input.sourceExternalId, references });
    } else await syncProviderCreators(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType, facts: input.facts });
    const [genreRow] = await tx.select({ genres: mediaItemGenresJsonSql(), platforms: mediaItemPlatformsJsonSql(), writerCreators: entryProviderWriterCreatorsJsonSql() }).from(mediaItems)
      .where(eq(mediaItems.id, input.mediaItemId));
    return {
      partConflicts: partsResult.conflicts,
      metadata: mapMediaItemMetadata(row, genreRow.genres, genreRow.platforms, item.mediaType === "book" ? genreRow.writerCreators : undefined),
      title: item.title, mediaType: item.mediaType, unmapped: resolved.unmapped,
      unmappedPlatforms: resolvedPlatforms.unmapped,
      shouldWarnPlatforms: hasNewUnmappedPlatforms({
        unmapped: resolvedPlatforms.unmapped, provider,
        previousProvider: previous?.sourceProvider ?? null, previousFacts: previous?.facts ?? null,
      }),
      shouldWarn: hasNewUnmappedGenres({
        unmapped: resolved.unmapped, provider,
        previousProvider: previous?.sourceProvider ?? null, previousFacts: previous?.facts ?? null,
      }),
    };
  });
  if (result.partConflicts.length) {
    await logSystemActivity({ action: "media.parts.sync-conflict", entityId: input.mediaItemId, entityLabel: result.title,
      message: "При обновлении частей записи обнаружен конфликт источников или нумерации.", severity: "warning",
      metadata: { provider, conflicts: result.partConflicts } });
  }
  if (result.shouldWarn && !provider) {
    await logSystemActivity({
      action: "media.genres.unmapped", entityId: input.mediaItemId, entityLabel: result.title,
      message: "Для части жанров записи не найдены внутренние соответствия.", severity: "warning",
      metadata: { provider, mediaType: result.mediaType, reason: provider ? "unmapped-value" : "missing-provider",
        genres: result.unmapped.map((genre) => ({ name: genre.name, id: genre.id })) },
    });
  }
  if (result.shouldWarnPlatforms && !provider) {
    await logSystemActivity({
      action: "media.platforms.unmapped", entityId: input.mediaItemId, entityLabel: result.title,
      message: "Для части платформ записи не найдены внутренние соответствия.", severity: "warning",
      metadata: { provider, mediaType: result.mediaType, reason: "missing-provider",
        platforms: result.unmappedPlatforms.map((platform) => ({ name: platform.name })) },
    });
  }
  return result.metadata;
}

export async function deleteMediaItemMetadata(mediaItemId: number) {
  await db.transaction(async (tx) => {
    await tx.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.id, mediaItemId)).for("update");
    await tx.delete(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
    await tx.delete(gameCompanyRosters).where(eq(gameCompanyRosters.mediaItemId, mediaItemId));
    await syncProviderCreators(tx, { mediaItemId, provider: null, mediaType: "", facts: {} });
    await syncGenreRequestOccurrences(tx, { mediaItemId, provider: null, mediaType: "", externalGenres: [] });
    await syncMediaItemProviderGenres(tx, { mediaItemId, provider: null, genres: [] });
    await syncPlatformRequestOccurrences(tx, { mediaItemId, provider: null, mediaType: "", externalPlatforms: [] });
    await syncMediaItemProviderPlatforms(tx, { mediaItemId, provider: null, platforms: [] });
  });
}

const hasMetadataSourceSql = sql`(
  ${mediaItemMetadata.sourceProvider} is not null
  and btrim(${mediaItemMetadata.sourceProvider}) <> ''
  and ${mediaItemMetadata.sourceExternalId} is not null
  and btrim(${mediaItemMetadata.sourceExternalId}) <> ''
)`

const missingMetadataFactsSql = sql`(
  ${mediaItemMetadata.fetchedAt} is null
  or ${mediaItemMetadata.facts} = '{}'::jsonb
)`

export const METADATA_REFRESH_MEDIA_TYPES = ["series", "anime"] as const

export type MediaMetadataJobItem = {
  id: number
  mediaType: string
  platformCode: string | null
  metadataAttemptedAt: Date | null
  originalTitle: string | null
  releaseYear: number | null
  sourceExternalId: string | null
  sourceProvider: string | null
  title: string
}

function mapMetadataJobItem(row: {
  id: number
  mediaType: string
  platformCode: string | null
  metadataAttemptedAt: Date | null
  originalTitle: string | null
  releaseYear: number | null
  sourceExternalId: string | null
  sourceProvider: string | null
  title: string
}): MediaMetadataJobItem {
  return {
    id: row.id,
    mediaType: row.mediaType,
    platformCode: row.platformCode,
    metadataAttemptedAt: row.metadataAttemptedAt,
    originalTitle: row.originalTitle,
    releaseYear: row.releaseYear,
    sourceExternalId: row.sourceExternalId,
    sourceProvider: row.sourceProvider,
    title: row.title,
  }
}

const metadataJobItemSelect = {
  id: mediaItems.id,
  mediaType: mediaItems.mediaType,
  platformCode: mediaCarriers.code,
  metadataAttemptedAt: mediaItems.metadataAttemptedAt,
  originalTitle: mediaItems.originalTitle,
  releaseYear: mediaItems.releaseYear,
  sourceExternalId: mediaItemMetadata.sourceExternalId,
  sourceProvider: mediaItemMetadata.sourceProvider,
  title: mediaItems.title,
}

export async function getMediaItemsMissingMetadata(input: {
  limit?: number
  mediaItemId?: number
  partsOnly?: boolean
  force?: boolean
  mediaType?: string
} = {}) {
  const knownMissing = and(hasMetadataSourceSql, missingMetadataFactsSql)
  const unmatched = sql`not ${hasMetadataSourceSql}`
  const conditions = [
    input.partsOnly && input.mediaItemId ? undefined : eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    input.partsOnly ? and(eq(mediaItems.mediaType, "series"), eq(mediaItemMetadata.sourceProvider, "tmdb"), hasMetadataSourceSql,
      input.mediaItemId || input.force ? undefined : sql`not exists (select 1 from ${titleParts} where ${titleParts.mediaItemId} = ${mediaItems.id} and ${titleParts.sourceProvider} = 'tmdb')`) : input.force ? undefined : or(knownMissing, unmatched),
    input.mediaType ? eq(mediaItems.mediaType, input.mediaType) : undefined,
  ]

  if (input.mediaItemId) {
    conditions.push(eq(mediaItems.id, input.mediaItemId))
  }

  const query = db
    .select(metadataJobItemSelect)
    .from(mediaItems)
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .where(and(...conditions))
    .orderBy(
      sql`case when ${knownMissing} then 0 else 1 end`,
      sql`${mediaItems.metadataAttemptedAt} asc nulls first`,
      asc(mediaItems.id),
    )

  const rows = await (input.limit ? query.limit(input.limit) : query)
  return rows.map(mapMetadataJobItem)
}

export async function getMediaItemsStaleMetadata(input: {
  limit?: number
  mediaItemId?: number
  staleDays: number
}) {
  const conditions = [
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    hasMetadataSourceSql,
    sql`not ${missingMetadataFactsSql}`,
    inArray(mediaItems.mediaType, [...METADATA_REFRESH_MEDIA_TYPES]),
    sql`${mediaItemMetadata.fetchedAt} < now() - (${input.staleDays}::int * interval '1 day')`,
  ]

  if (input.mediaItemId) {
    conditions.push(eq(mediaItems.id, input.mediaItemId))
  }

  const query = db
    .select(metadataJobItemSelect)
    .from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .where(and(...conditions))
    .orderBy(
      sql`${mediaItems.metadataAttemptedAt} asc nulls first`,
      asc(mediaItems.id),
    )

  const rows = await (input.limit ? query.limit(input.limit) : query)
  return rows.map(mapMetadataJobItem)
}

export async function markMediaItemMetadataAttempt(mediaItemId: number, issueCode: MetadataIssueCode | null) {
  await db
    .update(mediaItems)
    .set({ metadataAttemptedAt: new Date(), metadataIssueCode: issueCode })
    .where(eq(mediaItems.id, mediaItemId))
}
