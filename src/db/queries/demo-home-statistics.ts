import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import { mediaItems } from "@/db/schema"
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status"
import { normalizeDemoHomeStatisticsCodes } from "@/lib/user-state/demo-home-statistics"

export async function getDemoHomeStatisticsMediaItems(mediaItemCodes: readonly unknown[]) {
  const uniqueCodes = normalizeDemoHomeStatisticsCodes(mediaItemCodes)

  if (uniqueCodes.length === 0) return []

  return db
    .select({
      code: mediaItems.code,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
    })
    .from(mediaItems)
    .where(and(
      inArray(mediaItems.code, uniqueCodes),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    ))
}
