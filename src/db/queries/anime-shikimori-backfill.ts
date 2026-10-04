import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaItemMetadata, mediaItems, mediaItemTitleAliases } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { needsShikimoriDescriptionRefresh } from "@/lib/media/shikimori-description";

export async function getAnimeShikimoriRequeueCandidates() {
  const rows = await db.select({
    id: mediaItems.id,
    description: mediaItems.description,
    attemptedAt: mediaItems.shikimoriEnrichmentAttemptedAt,
  }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(and(
      eq(mediaItems.mediaType, "anime"),
      isNotNull(mediaItems.shikimoriEnrichmentAttemptedAt),
      eq(mediaItemMetadata.sourceProvider, "anilist"),
      sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`,
    )).orderBy(asc(mediaItems.id));

  return rows.filter((item) => needsShikimoriDescriptionRefresh(item.description));
}

export async function requeueAnimeShikimoriItem(candidate: { id: number; attemptedAt: Date | null }) {
  if (!candidate.attemptedAt) return false;

  return db.transaction(async (tx) => {
    const [current] = await tx.select({ description: mediaItems.description })
      .from(mediaItems)
      .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
      .where(and(
        eq(mediaItems.id, candidate.id),
        eq(mediaItems.mediaType, "anime"),
        eq(mediaItems.shikimoriEnrichmentAttemptedAt, candidate.attemptedAt!),
        eq(mediaItemMetadata.sourceProvider, "anilist"),
        sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`,
      )).for("update").limit(1);

    if (!current || !needsShikimoriDescriptionRefresh(current.description)) return false;

    await tx.update(mediaItems)
      .set({ shikimoriEnrichmentAttemptedAt: null })
      .where(eq(mediaItems.id, candidate.id));
    return true;
  });
}

const aliasesSql = sql<string[]>`coalesce((
  select array_agg(${mediaItemTitleAliases.value} order by ${mediaItemTitleAliases.id})
  from ${mediaItemTitleAliases}
  where ${mediaItemTitleAliases.mediaItemId} = ${mediaItems.id}
), array[]::text[])`;

export type AnimeShikimoriBackfillItem = {
  aliases: string[];
  description: string | null;
  id: number;
  originalTitle: string | null;
  sourceExternalId: string;
  title: string;
};

const itemSelect = {
  aliases: aliasesSql,
  description: mediaItems.description,
  id: mediaItems.id,
  originalTitle: mediaItems.originalTitle,
  sourceExternalId: mediaItemMetadata.sourceExternalId,
  title: mediaItems.title,
};

export async function getPendingAnimeShikimoriBackfillItems() {
  const rows = await db
    .select(itemSelect)
    .from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(and(
      eq(mediaItems.mediaType, "anime"),
      isNull(mediaItems.shikimoriEnrichmentAttemptedAt),
      eq(mediaItemMetadata.sourceProvider, "anilist"),
      sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`,
    ))
    .orderBy(asc(mediaItems.id));

  return rows as AnimeShikimoriBackfillItem[];
}

async function getLockedItem(tx: DbTransaction, mediaItemId: number) {
  const [item] = await tx.select({
    description: mediaItems.description,
    id: mediaItems.id,
    originalTitle: mediaItems.originalTitle,
    title: mediaItems.title,
  }).from(mediaItems).where(and(
    eq(mediaItems.id, mediaItemId),
    eq(mediaItems.mediaType, "anime"),
    isNull(mediaItems.shikimoriEnrichmentAttemptedAt),
  )).for("update").limit(1);

  if (!item) return null;

  const aliases = await tx.select({ id: mediaItemTitleAliases.id, value: mediaItemTitleAliases.value })
    .from(mediaItemTitleAliases)
    .where(eq(mediaItemTitleAliases.mediaItemId, mediaItemId))
    .orderBy(asc(mediaItemTitleAliases.id));

  return { ...item, aliases };
}

export async function markAnimeShikimoriBackfillSkipped(input: {
  mediaItemId: number;
  shouldMark: (item: NonNullable<Awaited<ReturnType<typeof getLockedItem>>>) => boolean;
}) {
  return db.transaction(async (tx) => {
    const item = await getLockedItem(tx, input.mediaItemId);
    if (!item || !input.shouldMark(item)) return false;

    await tx.update(mediaItems)
      .set({ shikimoriEnrichmentAttemptedAt: new Date() })
      .where(eq(mediaItems.id, item.id));
    return true;
  });
}

export async function applyAnimeShikimoriBackfillResult(input: {
  decide: (item: NonNullable<Awaited<ReturnType<typeof getLockedItem>>>) => {
    aliases: string[];
    description: string | null;
  };
  mediaItemId: number;
}) {
  return db.transaction(async (tx) => {
    const item = await getLockedItem(tx, input.mediaItemId);
    if (!item) return false;

    const decision = input.decide(item);
    await tx.update(mediaItems).set({
      description: decision.description,
      shikimoriEnrichmentAttemptedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(mediaItems.id, item.id));

    const currentAliases = item.aliases.map((alias) => alias.value);
    if (JSON.stringify(currentAliases) !== JSON.stringify(decision.aliases)) {
      await tx.delete(mediaItemTitleAliases).where(eq(mediaItemTitleAliases.mediaItemId, item.id));
      if (decision.aliases.length > 0) {
        await tx.insert(mediaItemTitleAliases).values(
          decision.aliases.map((value) => ({ mediaItemId: item.id, value })),
        );
      }
    }

    return true;
  });
}
