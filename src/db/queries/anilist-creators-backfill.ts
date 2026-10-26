import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaItemMetadata } from "@/db/schema";

export function getAnimeMissingCreatorRosterQuery(limit = 25, afterId = 0, mediaItemId?: number, force = false) {
  return db.select({ id: mediaItems.id, title: mediaItems.title, sourceProvider: mediaItemMetadata.sourceProvider, sourceExternalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.mediaType, "anime"), gt(mediaItems.id, afterId), gt(mediaItemMetadata.mediaItemId, afterId),
      mediaItemId ? eq(mediaItems.id, mediaItemId) : eq(mediaItems.publicationStatus, "published"),
      inArray(mediaItemMetadata.sourceProvider, ["anilist", "jikan"]), sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`,
      force ? undefined : sql`not (${mediaItemMetadata.facts} @> '{"anilistCreatorsComplete":true}'::jsonb or ${mediaItemMetadata.facts} @> '{"anilistCreatorsUnavailable":true}'::jsonb)`))
    .orderBy(asc(mediaItems.id)).limit(Math.min(200, Math.max(1, limit)));
}
