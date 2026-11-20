import {
  REVIEW_BODY_MAX_BYTES,
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
  type ReviewBodyFormat,
} from "@/lib/reviews/constants"

const REVIEW_LOCAL_DRAFT_VERSION = 3
const REVIEW_LOCAL_DRAFT_PREFIX = "zadrotto.review-draft"

export type ReviewDraftScope = "new" | `new-${number}-${number | "overall"}` | `${number}`

export type ReviewLocalDraft = {
  partId: number | null
  body: string
  bodyFormat: ReviewBodyFormat
  mediaItem: {
    id: number
    title: string
  } | null
  title: string
  updatedAt: string
  version: typeof REVIEW_LOCAL_DRAFT_VERSION
}

export function parseReviewDraftScope(value: string | null | undefined): ReviewDraftScope | null {
  if (value === "new") return value
  if (value && /^new-[1-9]\d*-(overall|[1-9]\d*)$/.test(value)) return value as ReviewDraftScope
  if (!value || !/^\d+$/.test(value) || Number(value) <= 0) return null
  return value as ReviewDraftScope
}

export function getReviewLocalDraftKey(authorId: number, scope: ReviewDraftScope) {
  return `${REVIEW_LOCAL_DRAFT_PREFIX}:${authorId}:${scope}`
}

export function parseReviewLocalDraft(raw: unknown): ReviewLocalDraft | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (value.version !== 1 && value.version !== 2 && value.version !== REVIEW_LOCAL_DRAFT_VERSION) return null
  const partId = value.version === 1 ? null : value.partId
  if (partId !== null && (typeof partId !== "number" || !Number.isInteger(partId) || partId <= 0)) return null
  if (typeof value.title !== "string" || value.title.length > REVIEW_TITLE_MAX_LENGTH) return null
  const bodyFormat = value.version === 3 ? value.bodyFormat : "plain"
  if (bodyFormat !== "plain" && bodyFormat !== "markdown") return null
  if (typeof value.body !== "string" || new TextEncoder().encode(value.body).length > REVIEW_BODY_MAX_BYTES) return null
  // Keep Markdown drafts even while the author is correcting an over-limit document.
  // Full visible-text validation happens when submitting the review.
  if (bodyFormat === "plain" && value.body.length > REVIEW_BODY_MAX_LENGTH) return null
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null

  const rawMediaItem = value.mediaItem
  let mediaItem: ReviewLocalDraft["mediaItem"] = null
  if (rawMediaItem !== null) {
    if (!rawMediaItem || typeof rawMediaItem !== "object") return null
    const candidate = rawMediaItem as Record<string, unknown>
    if (
      typeof candidate.id !== "number"
      || !Number.isInteger(candidate.id)
      || candidate.id <= 0
      || typeof candidate.title !== "string"
      || candidate.title.length === 0
      || candidate.title.length > 500
    ) return null
    mediaItem = { id: candidate.id, title: candidate.title }
  }

  return {
    partId,
    body: value.body,
    bodyFormat,
    mediaItem,
    title: value.title,
    updatedAt: value.updatedAt,
    version: REVIEW_LOCAL_DRAFT_VERSION,
  }
}

export function readReviewLocalDraft(key: string) {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? parseReviewLocalDraft(JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function hasUnknownDraftVersion(raw: string | null) {
  if (!raw) return false
  try {
    const value: unknown = JSON.parse(raw)
    return Boolean(value && typeof value === "object" && "version" in value
      && ![1, 2, REVIEW_LOCAL_DRAFT_VERSION].includes(value.version as number))
  } catch {
    return false
  }
}

export function writeReviewLocalDraft(
  key: string,
  input: Pick<ReviewLocalDraft, "body" | "mediaItem" | "title"> & { partId?: number | null; bodyFormat?: ReviewBodyFormat },
) {
  if (typeof window === "undefined") return
  try {
    if (hasUnknownDraftVersion(window.localStorage.getItem(key))) return
    if (!input.body && !input.title && !input.mediaItem) {
      window.localStorage.removeItem(key)
      return
    }
    const draft: ReviewLocalDraft = {
      ...input,
      partId: input.partId ?? null,
      bodyFormat: input.bodyFormat ?? "plain",
      updatedAt: new Date().toISOString(),
      version: REVIEW_LOCAL_DRAFT_VERSION,
    }
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage can be unavailable in private mode or when the quota is exhausted.
  }
}

export function clearReviewLocalDraft(key: string) {
  if (typeof window === "undefined") return
  try {
    if (hasUnknownDraftVersion(window.localStorage.getItem(key))) return
    window.localStorage.removeItem(key)
  } catch {
    // Keep cleanup non-fatal.
  }
}
