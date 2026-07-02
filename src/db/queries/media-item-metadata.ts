import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mediaItemMetadata } from "@/db/schema";

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
  const [row] = await db
    .insert(mediaItemMetadata)
    .values({
      mediaItemId: input.mediaItemId,
      facts: input.facts,
      sourceProvider: input.sourceProvider ?? null,
      sourceExternalId: input.sourceExternalId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      fetchedAt: input.fetchedAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: mediaItemMetadata.mediaItemId,
      set: {
        facts: input.facts,
        sourceProvider: input.sourceProvider ?? null,
        sourceExternalId: input.sourceExternalId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        fetchedAt: input.fetchedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  return mapMediaItemMetadata(row);
}

export async function deleteMediaItemMetadata(mediaItemId: number) {
  await db
    .delete(mediaItemMetadata)
    .where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
}
