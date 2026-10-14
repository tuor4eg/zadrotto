"use server"

import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

import {
  deleteAuthorDraftContributionReview,
  getAuthorReviewForEdit,
  getAuthorReviewForMediaItem,
  getPublishedMediaItemForReview,
  upsertAuthorReview,
} from "@/db/queries/contribution-reviews"
import { isTitlePartReviewable } from "@/lib/media/title-parts"
import { getTitlePart, getTitlePartsForMediaItem } from "@/db/queries/title-parts"
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types"
import { requireAuthor } from "@/lib/auth/author-auth"
import {
  getReviewFormErrorMessage,
  parseReviewFormInput,
  parseReviewPartId,
} from "@/lib/forms/contribution-review"
import { logActivity } from "@/lib/activity-logs/server"

export type SavePublicReviewState = {
  error: string | null
  values: {
    title: string
    body: string
  }
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value.trim() : ""
}

function getPositiveInteger(value: string) {
  const parsedValue = Number(value)

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function getFormValues(formData: FormData) {
  return {
    title: getFormString(formData, "title"),
    body: getFormString(formData, "body"),
  }
}

export async function deleteAuthorReviewDraftAction(formData: FormData) {
  const author = await requireAuthor()
  const contributionId = getPositiveInteger(getFormString(formData, "contributionId"))

  if (!contributionId) notFound()

  const deletedReview = await deleteAuthorDraftContributionReview(author.id, contributionId)

  if (!deletedReview) redirect("/reviews?view=mine&error=delete-locked")

  revalidatePath("/reviews")
  revalidatePath("/")

  await logActivity({
    action: "review.deleted",
    actorType: "author",
    authorId: author.id,
    entityType: "review",
    entityId: deletedReview.id,
    entityLabel: `Черновик рецензии #${deletedReview.id}`,
    message: "Черновик рецензии удален автором.",
  })

  redirect("/reviews?view=mine&deleted=1")
}

export async function savePublicReviewAction(
  _state: SavePublicReviewState,
  formData: FormData,
): Promise<SavePublicReviewState> {
  const author = await requireAuthor()
  const contributionId = getPositiveInteger(getFormString(formData, "contributionId"))
  const mediaItemId = getPositiveInteger(getFormString(formData, "mediaItemId"))
  const parsedPart = parseReviewPartId(formData.get("partId"))
  const partId = parsedPart.ok ? parsedPart.partId : null
  const intent = getFormString(formData, "intent")
  const status =
    intent === "draft"
      ? "draft"
      : author.canPublishMediaWithoutReview
        ? "published"
        : "submitted"
  const values = getFormValues(formData)
  const form = parseReviewFormInput({
    title: values.title,
    body: values.body,
  })

  if (!mediaItemId || !parsedPart.ok) {
    return {
      error: getReviewFormErrorMessage("invalid-media-item"),
      values,
    }
  }

  if (!form.ok) {
    return {
      error: getReviewFormErrorMessage(form.error),
      values,
    }
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id)
  const mediaItem = await getPublishedMediaItemForReview(
    mediaItemId,
    accessibleMediaTypeCodes,
  )

  if (!mediaItem) {
    return {
      error: getReviewFormErrorMessage("not-found"),
      values,
    }
  }

  const part = partId === null ? null : await getTitlePart(mediaItemId, partId)
  if (partId !== null && !part) {
    return { error: getReviewFormErrorMessage("not-found"), values }
  }

  if (part && !isTitlePartReviewable(part)) {
    return { error: "Рецензии на спецвыпуски недоступны.", values }
  }

  if (contributionId) {
    const existingReview = await getAuthorReviewForEdit(
      author.id,
      contributionId,
      accessibleMediaTypeCodes,
    )

    if (!existingReview || existingReview.mediaItemId !== mediaItemId) {
      notFound()
    }
  }

  if (!contributionId) {
    const existing = await getAuthorReviewForMediaItem(author.id, mediaItemId, partId)
    if (existing) redirect(`/reviews/${existing.id}/edit`)
  }

  const result = await upsertAuthorReview({
    contributionId,
    partId,
    mediaItemId,
    authorId: author.id,
    status,
    ...form.value,
  })

  if (!result.ok) {
    return {
      error: getReviewFormErrorMessage(result.reason),
      values,
    }
  }

  await logActivity({
    action: contributionId ? "review.updated" : "review.created",
    actorType: "author",
    authorId: author.id,
    entityType: "review",
    entityId: result.id,
    entityLabel: form.value.title,
    message: contributionId ? "Рецензия изменена автором." : "Рецензия создана автором.",
    metadata: {
      mediaItemId,
      mediaItemCode: mediaItem.code,
      publicationStatus: status,
    },
  })

  revalidatePath(`/media/${mediaItem.code}`)
  revalidatePath("/admin/reviews")
  revalidatePath("/admin", "layout")
  revalidatePath("/reviews")
  revalidatePath("/")

  const toastParam =
    status === "draft" ? "saved" : status === "published" ? "published" : "submitted"

  const reviewDraftScope = contributionId ? String(contributionId) : `new-${mediaItemId}-${partId ?? "overall"}`
  redirect(`/reviews?view=mine&${toastParam}=1&reviewDraft=${reviewDraftScope}`)
}

export async function getReviewPartOptionsAction(mediaItemId: number) {
  const author = await requireAuthor()
  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) return []
  const codes = await getAccessibleMediaTypeCodes(author.id)
  if (!await getPublishedMediaItemForReview(mediaItemId, codes)) return []
  const parts = await getTitlePartsForMediaItem(mediaItemId)
  return parts.filter(isTitlePartReviewable).map(({ id, name, type, number }) => ({ id, name, type, number }))
}
