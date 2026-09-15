import { and, asc, eq, inArray, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { mediaCarriers, mediaItemMetadata, mediaItems } from "@/db/schema"
import type { MetadataIssueCode } from "@/lib/media/metadata-issue"
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status"

export type MediaItemMetadataFacts = Record<string, unknown>;

export type MediaItemMetadataValue = {
  mediaItemId: number;
  facts: MediaItemMetadataFacts;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  fetchedAt: Date | null;
  updatedAt: Date;
};

export type UpsertMediaItemMetadataInput = {
  mediaItemId: number;
  facts: MediaItemMetadataFacts;
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: Date | null;
};

function mapMediaItemMetadata(row: typeof mediaItemMetadata.$inferSelect): MediaItemMetadataValue {
  return {
    mediaItemId: row.mediaItemId,
    facts: row.facts,
    sourceProvider: row.sourceProvider,
    sourceExternalId: row.sourceExternalId,
    sourceUrl: row.sourceUrl,
    fetchedAt: row.fetchedAt,
    updatedAt: row.updatedAt,
  };
}

export async function getMediaItemMetadata(
  mediaItemId: number,
): Promise<MediaItemMetadataValue | null> {
  const [row] = await db
    .select()
    .from(mediaItemMetadata)
    .where(eq(mediaItemMetadata.mediaItemId, mediaItemId))
    .limit(1);

  return row ? mapMediaItemMetadata(row) : null;
}

export async function upsertMediaItemMetadata(
  input: UpsertMediaItemMetadataInput,
): Promise<MediaItemMetadataValue> {
  const now = new Date();
  const fetchedAt = input.fetchedAt === undefined ? now : input.fetchedAt;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(mediaItemMetadata)
      .values({
        mediaItemId: input.mediaItemId,
        facts: input.facts,
        sourceProvider: input.sourceProvider ?? null,
        sourceExternalId: input.sourceExternalId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        fetchedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: mediaItemMetadata.mediaItemId,
        set: {
          facts: input.facts,
          sourceProvider: input.sourceProvider ?? null,
          sourceExternalId: input.sourceExternalId ?? null,
          sourceUrl: input.sourceUrl ?? null,
          fetchedAt,
          updatedAt: now,
        },
      })
      .returning();

    if (Object.keys(input.facts).length > 0) {
      await tx.update(mediaItems).set({ metadataIssueCode: null })
        .where(eq(mediaItems.id, input.mediaItemId));
    }

    return mapMediaItemMetadata(row);
  });
}

export async function deleteMediaItemMetadata(mediaItemId: number) {
  await db
    .delete(mediaItemMetadata)
    .where(eq(mediaItemMetadata.mediaItemId, mediaItemId))
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
} = {}) {
  const knownMissing = and(hasMetadataSourceSql, missingMetadataFactsSql)
  const unmatched = sql`not ${hasMetadataSourceSql}`
  const conditions = [
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    or(knownMissing, unmatched),
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
