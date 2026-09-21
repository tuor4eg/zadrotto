"use client"

import { useEffect } from "react"

import {
  clearReviewLocalDraft,
  getReviewLocalDraftKey,
  type ReviewDraftScope,
} from "@/lib/forms/review-local-draft"

export function ReviewLocalDraftCleanup({
  authorId,
  scope,
}: {
  authorId: number
  scope: ReviewDraftScope
}) {
  useEffect(() => {
    clearReviewLocalDraft(getReviewLocalDraftKey(authorId, scope))
  }, [authorId, scope])

  return null
}
