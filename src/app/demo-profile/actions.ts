"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  AuthorMediaStatusConflictError,
  getAuthorMediaStatus,
  setAuthorMediaStatus,
} from "@/db/queries/author-media-statuses"
import { upsertAuthorMediaExperience } from "@/db/queries/author-media-experiences"
import { getAccessibleMediaTypeCodes, getMediaTypeCodeFilterSql } from "@/db/queries/media-types"
import { getAuthorRating, upsertAuthorRating } from "@/db/queries/ratings"
import { mediaItems, mediaTypes } from "@/db/schema"
import { getCurrentAuthor } from "@/lib/auth/author-auth"
import { isAuthorMediaStatus } from "@/lib/media/author-media-status"
import { parseDemoProfile } from "@/lib/user-state/demo-profile"
import { shouldImportDemoRating, shouldImportDemoStatus } from "@/lib/user-state/demo-selectors"

export type ImportDemoProfileResult = {
  importedRatings: number
  importedStatuses: number
  skippedConflicts: number
  ok: true
} | {
  error: string
  ok: false
}

export async function importDemoProfileAction(
  rawProfile: unknown,
): Promise<ImportDemoProfileResult> {
  const author = await getCurrentAuthor()
  if (!author) {
    return { ok: false, error: "Нужно войти в аккаунт." }
  }

  const profile = parseDemoProfile(rawProfile)
  if (!profile || profile.import.importedAt != null) {
    return { ok: false, error: "Demo-профиль не найден или уже импортирован." }
  }

  const codes = [
    ...new Set([
      ...Object.keys(profile.ratings),
      ...Object.keys(profile.statuses),
    ]),
  ]
  if (codes.length === 0) {
    return { ok: true, importedRatings: 0, importedStatuses: 0, skippedConflicts: 0 }
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id)
  const items = await db
    .select({
      code: mediaItems.code,
      id: mediaItems.id,
    })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .where(and(
      inArray(mediaItems.code, codes),
      eq(mediaItems.publicationStatus, "published"),
      eq(mediaTypes.isPubliclyAvailable, true),
      getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
    ))

  const idByCode = new Map(items.map((item) => [item.code, item.id]))
  let importedRatings = 0
  let importedStatuses = 0
  let skippedConflicts = 0

  for (const [code, entry] of Object.entries(profile.ratings)) {
    const mediaItemId = idByCode.get(code)
    if (mediaItemId == null) {
      skippedConflicts += 1
      continue
    }

    const existing = await getAuthorRating(mediaItemId, author.id)
    if (!shouldImportDemoRating(Boolean(existing))) {
      skippedConflicts += 1
      continue
    }

    await upsertAuthorRating({
      authorId: author.id,
      mediaItemId,
      score: entry.score,
    })
    if (
      entry.experience?.experiencedAt
      && (entry.experience.precision === "year"
        || entry.experience.precision === "month"
        || entry.experience.precision === "day")
    ) {
      await upsertAuthorMediaExperience({
        authorId: author.id,
        mediaItemId,
        firstExperiencedAt: entry.experience.experiencedAt,
        firstExperiencedPrecision: entry.experience.precision,
      })
    }
    importedRatings += 1
  }

  for (const [code, entry] of Object.entries(profile.statuses)) {
    if (!isAuthorMediaStatus(entry.status)) continue
    if (profile.ratings[code]) continue

    const mediaItemId = idByCode.get(code)
    if (mediaItemId == null) {
      skippedConflicts += 1
      continue
    }

    const existingRating = await getAuthorRating(mediaItemId, author.id)
    if (existingRating) {
      skippedConflicts += 1
      continue
    }

    const existingStatus = await getAuthorMediaStatus({
      authorId: author.id,
      mediaItemId,
    })
    if (!shouldImportDemoStatus({
      hasDemoRating: false,
      hasServerRating: Boolean(existingRating),
      hasServerStatus: Boolean(existingStatus),
    })) {
      skippedConflicts += 1
      continue
    }

    try {
      await setAuthorMediaStatus({
        authorId: author.id,
        mediaItemId,
        status: entry.status,
      })
      importedStatuses += 1
    } catch (error) {
      if (error instanceof AuthorMediaStatusConflictError) {
        skippedConflicts += 1
        continue
      }
      throw error
    }
  }

  revalidatePath("/")
  revalidatePath("/archive")
  revalidatePath("/author")
  revalidatePath("/achievements")

  return {
    ok: true,
    importedRatings,
    importedStatuses,
    skippedConflicts,
  }
}
