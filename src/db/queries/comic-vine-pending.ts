import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItemMetadata, mediaItems } from "@/db/schema";

export function getPendingComicVineItemsQuery(input: { afterId: number; limit: number; mediaItemId?: number }) {
  return db.select({ id: mediaItems.id })
    .from(mediaItemMetadata)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMetadata.mediaItemId))
    .where(and(
      gt(mediaItemMetadata.mediaItemId, input.afterId),
      input.mediaItemId === undefined ? undefined : eq(mediaItemMetadata.mediaItemId, input.mediaItemId),
      eq(mediaItems.publicationStatus, "published"),
      eq(mediaItems.mediaType, "comic"),
      eq(mediaItems.metadataSearchDisabled, false),
      sql`${mediaItemMetadata.sourceProvider} = 'comic-vine'`,
      sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`,
      sql`not (${mediaItemMetadata.facts} @> '{"comicVineIssuesComplete":true}'::jsonb)`,
    ))
    .orderBy(asc(sql`coalesce(${mediaItemMetadata.facts}->>'comicVineIssueLastAttemptAt', '')`), asc(mediaItemMetadata.mediaItemId))
    .limit(Math.min(200, Math.max(1, input.limit)));
}
