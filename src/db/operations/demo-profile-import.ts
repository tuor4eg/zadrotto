import { and, eq, inArray, sql } from "drizzle-orm"

import {
  authorMediaExperiences,
  authorMediaStatuses,
  mediaItems,
  mediaTypes,
  ratings,
  titleParts,
} from "@/db/schema"
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types"
import { runInDomainEventTransaction } from "@/db/transaction"
import type { DemoProfile } from "@/lib/user-state/demo-profile"

export async function importDemoProfile(input: {
  accessibleMediaTypeCodes: string[]
  authorId: number
  profile: DemoProfile
}) {
  const ratingEntries = [
    ...Object.entries(input.profile.ratings).map(([code, entry]) => ({ code, entry, partId: null as number | null })),
    ...Object.entries(input.profile.partRatings).flatMap(([code, parts]) =>
      Object.entries(parts).map(([id, entry]) => ({ code, entry, partId: Number(id) }))),
  ]
  const statusEntries = Object.entries(input.profile.statuses)
  const codes = [...new Set([...ratingEntries.map(({ code }) => code), ...statusEntries.map(([code]) => code)])]
  if (codes.length === 0) {
    return {
      importedRatings: 0,
      importedStatuses: 0,
      skippedConflicts: 0,
      skippedUnavailable: 0,
    }
  }

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
        from unnest(array[${sql.join(itemIds.map((itemId) => sql`${itemId}`), sql`, `)}]::integer[])
          as locked(media_item_id)
        order by locked.media_item_id
      `)
    }

    const existingRatings = itemIds.length === 0 ? [] : await tx
      .select({ mediaItemId: ratings.mediaItemId, partId: ratings.partId }).from(ratings)
      .where(and(eq(ratings.authorId, input.authorId), inArray(ratings.mediaItemId, itemIds)))
    const existingStatuses = itemIds.length === 0 ? [] : await tx
      .select({ mediaItemId: authorMediaStatuses.mediaItemId }).from(authorMediaStatuses)
      .where(and(eq(authorMediaStatuses.authorId, input.authorId), inArray(authorMediaStatuses.mediaItemId, itemIds)))
    const occupied = new Set(existingStatuses.map((row) => row.mediaItemId))
    const scopeKey = (mediaItemId: number, partId: number | null) => `${mediaItemId}:${partId ?? "overall"}`
    const existingScopes = new Set(existingRatings.map((row) => scopeKey(row.mediaItemId, row.partId)))
    const partIds = ratingEntries.flatMap(({ partId }) => partId === null ? [] : [partId])
    const availableParts = partIds.length === 0 || itemIds.length === 0 ? [] : await tx
      .select({ id: titleParts.id, mediaItemId: titleParts.mediaItemId }).from(titleParts)
      .where(and(inArray(titleParts.id, partIds), inArray(titleParts.mediaItemId, itemIds), sql`NOT (${titleParts.type} = 'season' AND ${titleParts.number} = 0)`))
    const validParts = new Set(availableParts.map((row) => scopeKey(row.mediaItemId, row.id)))
    const unavailableRating = ({ code, partId }: typeof ratingEntries[number]) => {
      const mediaItemId = idByCode.get(code)
      return mediaItemId == null || (partId !== null && !validParts.has(scopeKey(mediaItemId, partId)))
    }
    const skippedUnavailable = ratingEntries.filter(unavailableRating).length
      + statusEntries.filter(([code]) => !idByCode.has(code)).length
    const now = new Date()
    const ratingRows = ratingEntries.flatMap((rating) => {
      const { code, entry, partId } = rating
      const mediaItemId = idByCode.get(code)
      return mediaItemId == null || unavailableRating(rating) || occupied.has(mediaItemId)
        || existingScopes.has(scopeKey(mediaItemId, partId))
        ? []
        : [{ authorId: input.authorId, mediaItemId, partId, score: entry.score, createdAt: now, updatedAt: now }]
    }).sort((left, right) => left.mediaItemId - right.mediaItemId || (left.partId ?? 0) - (right.partId ?? 0))
    const insertedRatings = ratingRows.length === 0 ? [] : await tx.insert(ratings)
      .values(ratingRows).onConflictDoNothing()
      .returning({ mediaItemId: ratings.mediaItemId, partId: ratings.partId })
    const insertedRatingIds = new Set(insertedRatings.map((row) => row.mediaItemId))
    const insertedOverallIds = new Set(insertedRatings.filter((row) => row.partId === null).map((row) => row.mediaItemId))

    const experienceRows = ratingEntries.flatMap(({ code, entry, partId }) => {
      const mediaItemId = idByCode.get(code)
      const experience = entry.experience
      return partId === null && mediaItemId != null && insertedOverallIds.has(mediaItemId)
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
      return mediaItemId == null || occupied.has(mediaItemId) || existingRatings.some((row) => row.mediaItemId === mediaItemId) || insertedRatingIds.has(mediaItemId)
        ? []
        : [{ authorId: input.authorId, mediaItemId, status: entry.status, createdAt: now, updatedAt: now }]
    })
    const insertedStatuses = statusRows.length === 0 ? [] : await tx.insert(authorMediaStatuses)
      .values(statusRows).onConflictDoNothing({ target: [authorMediaStatuses.authorId, authorMediaStatuses.mediaItemId] })
      .returning({ mediaItemId: authorMediaStatuses.mediaItemId })

    await appendEvents(insertedRatings.map(({ mediaItemId, partId }) => ({
        actorAuthorId: input.authorId,
        aggregateId: `${input.authorId}:${mediaItemId}${partId === null ? "" : `:part:${partId}`}`,
        aggregateType: "rating",
        payload: { authorId: input.authorId, mediaItemId, ...(partId === null ? {} : { partId }) },
        type: "rating.created",
      })))

    return {
      importedRatings: insertedRatings.length,
      importedStatuses: insertedStatuses.length,
      skippedConflicts: ratingEntries.length
        + statusEntries.length
        - skippedUnavailable
        - insertedRatings.length
        - insertedStatuses.length,
      skippedUnavailable,
    }
  })
}
