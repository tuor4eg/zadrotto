import type { DbTransaction } from "@/db/transaction";
import { getWorkingBookPublishers } from "@/db/queries/book-publisher-roster";
import { guardSnapshotJob, withSnapshotJobGuard, attachProviderSnapshots, lockProviderSnapshotReferences, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { prepareBookSnapshotReferences, bookProjectionLegacyFacts } from "@/lib/providers/book-service";
import { isNormalizedBookProvider } from "@/lib/providers/book-cutover";
import type { SnapshotReference } from "@/lib/providers/snapshot-values";
import { mediaMetadataFactsSql, normalizedBookProviderSql } from "@/db/queries/book-metadata";
import { saveGameCompanyRoster } from "./game-companies";
import { extractGameCompanyReferences, isGameCompanyProvider } from "@/lib/creators/game-companies";
import { gameCompanyRosters } from "@/db/schema";
import { syncProviderCreators } from "@/db/queries/creator-requests"
import { entryProviderWriterCreatorsJsonSql } from "@/db/queries/creators"
import type { TitlePartProviderInput } from "@/lib/media/title-parts"
import { syncProviderTitleParts } from "@/db/queries/title-parts-sync"
import { createJobRun } from "@/db/queries/jobs"
import { and, asc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm"

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
  snapshotReferences?: SnapshotReference[];
  jobGuard?: SnapshotJobGuard;
  expectedSource?: {provider:string|null;externalId:string|null};
  checkpoint?: Record<string,unknown>;
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
    .select({ mediaType: mediaItems.mediaType, metadata: {mediaItemId:mediaItemMetadata.mediaItemId,facts:mediaMetadataFactsSql(),sourceProvider:mediaItemMetadata.sourceProvider,sourceExternalId:mediaItemMetadata.sourceExternalId,sourceUrl:mediaItemMetadata.sourceUrl,fetchedAt:mediaItemMetadata.fetchedAt,createdAt:mediaItemMetadata.createdAt,updatedAt:mediaItemMetadata.updatedAt,originalLanguage:mediaItemMetadata.originalLanguage}, genres: mediaItemGenresJsonSql(mediaItemMetadata.mediaItemId), platforms: mediaItemPlatformsJsonSql(mediaItemMetadata.mediaItemId), writerCreators: entryProviderWriterCreatorsJsonSql(sql`"media_item_metadata"."media_item_id"`) })
    .from(mediaItemMetadata)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMetadata.mediaItemId))
    .where(eq(mediaItemMetadata.mediaItemId, mediaItemId))
    .limit(1);

  return row ? mapMediaItemMetadata({...row.metadata,facts:row.metadata.facts ?? {}}, row.genres, row.platforms, row.mediaType === "book" ? row.writerCreators : undefined) : null;
}

export async function upsertMediaItemMetadata(
  input: UpsertMediaItemMetadataInput,
  transaction?: DbTransaction,
): Promise<MediaItemMetadataValue> {
  const now = new Date();
  const provider = input.sourceProvider?.trim() || null;
  const prepared = input.snapshotReferences && provider && input.sourceExternalId
    ? await prepareBookSnapshotReferences(provider,input.sourceExternalId,input.snapshotReferences,transaction ?? db) : null;
  const fetchedAt = input.fetchedAt === undefined ? prepared?.primary.fetchedAt ?? now : input.fetchedAt;
  const work = async (tx:DbTransaction) => {
    await guardSnapshotJob(tx,input.jobGuard);
    const [item] = await tx.select({ mediaType: mediaItems.mediaType, title: mediaItems.title })
      .from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).for("update");
    if (!item) throw new Error("Media item not found");
    const normalizedBook = item.mediaType === "book" && await isNormalizedBookProvider(provider, tx);
    const [previous] = await tx.select({mediaItemId:mediaItemMetadata.mediaItemId,sourceProvider:mediaItemMetadata.sourceProvider,sourceExternalId:mediaItemMetadata.sourceExternalId,originalLanguage:mediaItemMetadata.originalLanguage,
      facts:normalizedBook ? sql<Record<string,unknown>>`'{}'::jsonb` : mediaItemMetadata.facts}).from(mediaItemMetadata)
      .where(eq(mediaItemMetadata.mediaItemId, input.mediaItemId));
    if (input.expectedSource && ((previous?.sourceProvider ?? null) !== input.expectedSource.provider || (previous?.sourceExternalId ?? null) !== input.expectedSource.externalId)) throw new Error("PROVIDER_SOURCE_CHANGED");
    if (prepared && item.mediaType !== "book") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
    if (input.snapshotReferences) await lockProviderSnapshotReferences(tx,input.snapshotReferences);
    if (normalizedBook && !prepared) throw new Error("PROVIDER_SNAPSHOT_REQUIRED");
    const sourceFacts = prepared ? bookProjectionLegacyFacts(prepared.projection) : input.facts;
    const publisherValue = !normalizedBook && previous?.sourceProvider === provider ? previous.facts.publishers : null;
    const historicalPublishers = (typeof publisherValue === "string" ? [publisherValue] : Array.isArray(publisherValue) ? publisherValue : [])
      .filter((name):name is string=>typeof name==="string" && Boolean(name.trim()));
    const workingPublishers = prepared && previous?.sourceProvider === provider ? await getWorkingBookPublishers(tx,input.mediaItemId,provider!) : [];
    const publishers = workingPublishers.length ? workingPublishers : historicalPublishers.map((name,position)=>({name,position,externalId:null,roleCode:"publisher" as const}));
    const contributors = prepared ? [...prepared.projection.contributors,...publishers] : undefined;
    const facts = normalizedBook ? previous?.facts ?? {} : {
      ...(item.mediaType === "book" && previous?.sourceProvider === provider ? previous.facts : {}), ...sourceFacts,
    };
    await lockGenreRequestsForMetadata(tx, { mediaItemId: input.mediaItemId, facts: sourceFacts, provider, mediaType: item.mediaType });
    // Global order: media item → genre request keys → platform request keys.
    await lockPlatformRequestsForMetadata(tx, { mediaItemId: input.mediaItemId, facts: input.facts, provider, mediaType: item.mediaType });
    const resolved = await resolveProviderGenres({ facts: input.facts, provider, mediaType: item.mediaType }, tx);
    const resolvedPlatforms = await resolveProviderPlatforms({ facts: input.facts, provider, mediaType: item.mediaType }, tx);
    const [row] = await tx
      .insert(mediaItemMetadata)
      .values({
        mediaItemId: input.mediaItemId,
        facts,
        originalLanguage: previous?.originalLanguage ?? (typeof previous?.facts.originalLanguage === "string" ? previous.facts.originalLanguage.trim() : null),
        sourceProvider: provider,
        sourceExternalId: prepared?.projection.externalId ?? input.sourceExternalId ?? null,
        sourceUrl: input.sourceUrl ?? prepared?.projection.sourceUrl ?? null,
        fetchedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: mediaItemMetadata.mediaItemId,
        set: {
          facts: normalizedBook ? undefined : facts,
          originalLanguage: previous?.originalLanguage ?? (typeof previous?.facts.originalLanguage === "string" ? previous.facts.originalLanguage.trim() : null),
          sourceProvider: provider,
          sourceExternalId: prepared?.projection.externalId ?? input.sourceExternalId ?? null,
          sourceUrl: input.sourceUrl ?? prepared?.projection.sourceUrl ?? null,
          fetchedAt,
          updatedAt: now,
        },
      })
      .returning({...getTableColumns(mediaItemMetadata),facts:normalizedBook ? sql<Record<string,unknown>>`'{}'::jsonb` : mediaItemMetadata.facts});

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

    // Book adapters own contributors only; do not erase independent normalized
    // genre/platform decisions when their projection supplies neither roster.
    if (!prepared) {
    await syncMediaItemProviderGenres(tx, { mediaItemId: input.mediaItemId, provider, genres: resolved.genres });
    await syncGenreRequestOccurrences(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType,
      externalGenres: extractExternalGenres(input.facts) });

    await syncMediaItemProviderPlatforms(tx, { mediaItemId: input.mediaItemId, provider, platforms: resolvedPlatforms.platforms });
    await syncPlatformRequestOccurrences(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType,
      externalPlatforms: item.mediaType === "game" ? extractExternalPlatforms(input.facts) : [] });

    }
    if (prepared || Object.keys(input.facts).length > 0) {
      await tx.update(mediaItems).set({ metadataIssueCode: null })
        .where(eq(mediaItems.id, input.mediaItemId));
    }

    if (item.mediaType === "game" && isGameCompanyProvider(provider) && input.sourceExternalId) {
      const references = extractGameCompanyReferences(input.facts, provider);
      if (references !== null) await saveGameCompanyRoster(tx, { mediaItemId: input.mediaItemId, provider, sourceExternalId: input.sourceExternalId, references });
    } else await syncProviderCreators(tx, { mediaItemId: input.mediaItemId, provider, mediaType: item.mediaType, facts: sourceFacts, contributors });
    if (prepared) await attachProviderSnapshots(tx,{entityType:"media-item",entityId:String(input.mediaItemId)},[
      {id:prepared.primary.id,payloadHash:prepared.primary.payloadHash,purpose:"primary"},
      ...prepared.dependencies.map(row=>({id:row.id,payloadHash:row.payloadHash,purpose:"dependency" as const})),
    ],{kind:"system"});
    if (input.jobGuard && input.checkpoint) {
      const {jobRuns}=await import("@/db/schema");
      await tx.update(jobRuns).set({payload:input.checkpoint,updatedAt:now}).where(eq(jobRuns.id,input.jobGuard.runId));
    }
    const [genreRow] = await tx.select({ genres: mediaItemGenresJsonSql(), platforms: mediaItemPlatformsJsonSql(), writerCreators: entryProviderWriterCreatorsJsonSql(), facts:mediaMetadataFactsSql() }).from(mediaItems)
      .leftJoin(mediaItemMetadata,eq(mediaItemMetadata.mediaItemId,mediaItems.id)).where(eq(mediaItems.id, input.mediaItemId));
    await guardSnapshotJob(tx,input.jobGuard);
    return {
      partConflicts: partsResult.conflicts,
      metadata: mapMediaItemMetadata({...row,facts:genreRow.facts??{}}, genreRow.genres, genreRow.platforms, item.mediaType === "book" ? genreRow.writerCreators : undefined),
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
  };
  const result = transaction ? await work(transaction) : await db.transaction(work);
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

const missingMetadataFactsSql = sql`case when ${mediaItems.mediaType}='book' and ${normalizedBookProviderSql()}
 then ${mediaItemMetadata.fetchedAt} is null
 else (${mediaItemMetadata.fetchedAt} is null or ${mediaItemMetadata.facts} = '{}'::jsonb) end`

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

export async function markMediaItemMetadataAttempt(mediaItemId: number, issueCode: MetadataIssueCode | null, jobGuard?:SnapshotJobGuard) {
  await withSnapshotJobGuard(jobGuard, async tx=>{
    await tx.update(mediaItems).set({metadataAttemptedAt:new Date(),metadataIssueCode:issueCode}).where(eq(mediaItems.id,mediaItemId));
  });
}
