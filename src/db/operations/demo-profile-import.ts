import { and, eq, inArray, sql } from "drizzle-orm"

import {
  authorMediaExperiences,
  authorMediaStatuses,
  mediaItems,
  mediaTypes,
  ratings,
} from "@/db/schema"
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types"
import { runInDomainEventTransaction } from "@/db/transaction"
import type { DemoProfile } from "@/lib/user-state/demo-profile"

export async function importDemoProfile(input: {
  accessibleMediaTypeCodes: string[]
  authorId: number
  profile: DemoProfile
}) {
  const ratingEntries = Object.entries(input.profile.ratings)
  const statusEntries = Object.entries(input.profile.statuses)
  const codes = [...new Set([...ratingEntries.map(([code]) => code), ...statusEntries.map(([code]) => code)])]
  if (codes.length === 0) return { importedRatings: 0, importedStatuses: 0, skippedConflicts: 0 }

  return runInDomainEventTransaction(async (tx, _appendEvent, appendEvents) => {
    const items = await tx.select({ code: mediaItems.code, id: mediaItems.id })
      .from(mediaItems)
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(and(
        inArray(mediaItems.code, codes),
        eq(mediaItems.publicationStatus, "published"),
        eq(mediaTypes.isPubliclyAvailable, true),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, input.accessibleMediaTypeCodes),
      ))
    const idByCode = new Map(items.map((item) => [item.code, item.id]))
    const itemIds = items.map((item) => item.id).sort((left, right) => left - right)
    if (itemIds.length > 0) {
      await tx.execute(sql`
        select pg_advisory_xact_lock(${input.authorId}::integer, locked.media_item_id::integer)
        from unnest(${itemIds}::integer[]) as locked(media_item_id)
        order by locked.media_item_id
      `)
    }

    const existingRatings = itemIds.length === 0 ? [] : await tx
      .select({ mediaItemId: ratings.mediaItemId }).from(ratings)
      .where(and(eq(ratings.authorId, input.authorId), inArray(ratings.mediaItemId, itemIds)))
    const existingStatuses = itemIds.length === 0 ? [] : await tx
      .select({ mediaItemId: authorMediaStatuses.mediaItemId }).from(authorMediaStatuses)
      .where(and(eq(authorMediaStatuses.authorId, input.authorId), inArray(authorMediaStatuses.mediaItemId, itemIds)))
    const occupied = new Set([
      ...existingRatings.map((row) => row.mediaItemId),
      ...existingStatuses.map((row) => row.mediaItemId),
    ])
    const now = new Date()
    const ratingRows = ratingEntries.flatMap(([code, entry]) => {
      const mediaItemId = idByCode.get(code)
      return mediaItemId == null || occupied.has(mediaItemId)
        ? []
        : [{ authorId: input.authorId, mediaItemId, score: entry.score, createdAt: now, updatedAt: now }]
    })
    const insertedRatings = ratingRows.length === 0 ? [] : await tx.insert(ratings)
      .values(ratingRows).onConflictDoNothing({ target: [ratings.mediaItemId, ratings.authorId] })
      .returning({ mediaItemId: ratings.mediaItemId })
    const insertedRatingIds = new Set(insertedRatings.map((row) => row.mediaItemId))

    const experienceRows = ratingEntries.flatMap(([code, entry]) => {
      const mediaItemId = idByCode.get(code)
      const experience = entry.experience
      return mediaItemId != null && insertedRatingIds.has(mediaItemId)
        && experience?.experiencedAt
        && (experience.precision === "year" || experience.precision === "month" || experience.precision === "day")
        ? [{
            authorId: input.authorId,
            mediaItemId,
            firstExperiencedAt: experience.experiencedAt,
            firstExperiencedPrecision: experience.precision,
            createdAt: now,
            updatedAt: now,
          }]
        : []
    })
    if (experienceRows.length > 0) {
      await tx.insert(authorMediaExperiences).values(experienceRows)
        .onConflictDoNothing({ target: [authorMediaExperiences.mediaItemId, authorMediaExperiences.authorId] })
    }

    const statusRows = statusEntries.flatMap(([code, entry]) => {
      const mediaItemId = idByCode.get(code)
      return mediaItemId == null || occupied.has(mediaItemId) || insertedRatingIds.has(mediaItemId)
        ? []
        : [{ authorId: input.authorId, mediaItemId, status: entry.status, createdAt: now, updatedAt: now }]
    })
    const insertedStatuses = statusRows.length === 0 ? [] : await tx.insert(authorMediaStatuses)
      .values(statusRows).onConflictDoNothing({ target: [authorMediaStatuses.authorId, authorMediaStatuses.mediaItemId] })
      .returning({ mediaItemId: authorMediaStatuses.mediaItemId })

    await appendEvents(insertedRatings.map(({ mediaItemId }) => ({
        actorAuthorId: input.authorId,
        aggregateId: `${input.authorId}:${mediaItemId}`,
        aggregateType: "rating",
        payload: { authorId: input.authorId, mediaItemId },
        type: "rating.created",
      })))

    return {
      importedRatings: insertedRatings.length,
      importedStatuses: insertedStatuses.length,
      skippedConflicts: ratingEntries.length + statusEntries.length - insertedRatings.length - insertedStatuses.length,
    }
  })
}
