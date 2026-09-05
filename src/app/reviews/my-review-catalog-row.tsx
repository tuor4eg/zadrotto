import Link from "next/link"
import { Edit3, Eye } from "lucide-react"

import { ArchiveCover } from "@/app/media-item-tile"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ArchiveTooltip } from "@/components/ui/archive-tooltip"
import { formatRelativeArchiveDate } from "@/lib/archive/relative-date"
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  isAuthorEditableContributionStatus,
  type ContributionStatus,
} from "@/lib/contributions/model"
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types"
import { formatScore } from "@/lib/ratings/score"
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone"

export type MyReviewCatalogRowItem = {
  id: number
  status: ContributionStatus
  adminNote: string | null
  authorScore: number | null
  title: string
  mediaItemCode: string
  mediaItemTitle: string
  mediaType: string
  mediaItemReleaseYear: number | null
  mediaItemCarrierCode: string | null
  coverThumbUrl: string | null
  coverUrl: string | null
  publishedAt: Date | string | null
  updatedAt: Date | string
}

const REVIEW_STATUS_BADGE_VARIANTS: Record<
  ContributionStatus,
  "default" | "outline" | "positive" | "warning" | "destructive"
> = {
  draft: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
  hidden: "default",
}

function MyReviewActions({ item }: { item: MyReviewCatalogRowItem }) {
  const canEdit = isAuthorEditableContributionStatus(item.status)
  const canOpen = item.status === "published"

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {canOpen ? (
        <ArchiveTooltip label="Открыть">
          <Link
            href={`/reviews/${item.id}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label={`Открыть рецензию «${item.title}»`}
          >
            <Eye />
          </Link>
        </ArchiveTooltip>
      ) : null}
      {canEdit ? (
        <ArchiveTooltip label="Редактировать">
          <Link
            href={`/reviews/${item.id}/edit`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label={`Редактировать рецензию «${item.title}»`}
          >
            <Edit3 />
          </Link>
        </ArchiveTooltip>
      ) : null}
    </div>
  )
}

function MyReviewScore({ score }: { score: number | null }) {
  const ratingToneClassName = AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(score)]

  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-sm tabular-nums shadow-sm sm:size-10 sm:text-base ${ratingToneClassName}`}
      aria-label={
        score === null ? "Оценка автора не указана" : `Оценка автора: ${formatScore(score)}`
      }
    >
      {formatScore(score)}
    </span>
  )
}

export function MyReviewCatalogRow({
  item,
  mediaTypes,
}: {
  item: MyReviewCatalogRowItem
  mediaTypes: readonly MediaTypeOption[]
}) {
  const mediaTypeLabel = getMediaTypeLabel(item.mediaType, mediaTypes)
  const updatedLabel = formatRelativeArchiveDate(item.updatedAt)
  const publishedLabel = item.publishedAt
    ? formatRelativeArchiveDate(item.publishedAt)
    : null

  return (
    <>
      <article className="hidden items-center gap-x-3 border-b border-stone-300/60 px-2 py-2 last:border-b-0 sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)_auto_minmax(5.5rem,7.5rem)_auto_2.75rem] sm:gap-x-4 sm:px-3">
        <span className="relative block aspect-[2/3] w-12 overflow-hidden rounded border border-stone-300/80 bg-stone-100 shadow-sm">
          <ArchiveCover
            carrierFrame={false}
            item={{
              coverUrl: item.coverThumbUrl ?? item.coverUrl,
              mediaCarrierCode: item.mediaItemCarrierCode,
              mediaType: item.mediaType,
              releaseYear: item.mediaItemReleaseYear,
              title: item.mediaItemTitle,
            }}
            className="absolute inset-0 h-full w-full"
          />
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-stone-950">
            {item.mediaItemTitle}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
            {mediaTypeLabel}
          </p>
          {item.adminNote ? (
            <p className="mt-1 truncate text-xs text-stone-500">{item.adminNote}</p>
          ) : null}
        </div>

        <p className="min-w-0 truncate text-sm font-semibold leading-snug text-stone-900">
          {item.title}
        </p>

        <div>
          <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[item.status]}>
            {CONTRIBUTION_STATUS_VALUE_LABELS[item.status]}
          </Badge>
        </div>

        <div className="min-w-0 text-xs text-stone-600">
          {publishedLabel ? (
            <p className="truncate leading-tight text-stone-800">{publishedLabel}</p>
          ) : updatedLabel ? (
            <p className="truncate leading-tight text-stone-800">{updatedLabel}</p>
          ) : (
            <p>—</p>
          )}
          {updatedLabel && publishedLabel ? (
            <p className="mt-0.5 truncate text-[10px] text-stone-500">
              обновлено {updatedLabel}
            </p>
          ) : null}
        </div>

        <MyReviewActions item={item} />
        <MyReviewScore score={item.authorScore} />
      </article>

      <article className="space-y-3 border-b border-stone-300/60 px-2 py-3 last:border-b-0 sm:hidden">
        <div className="flex gap-3">
          <span className="relative block aspect-[2/3] w-11 shrink-0 overflow-hidden rounded border border-stone-300/80 bg-stone-100 shadow-sm">
            <ArchiveCover
              carrierFrame={false}
              item={{
                coverUrl: item.coverThumbUrl ?? item.coverUrl,
                mediaCarrierCode: item.mediaItemCarrierCode,
                mediaType: item.mediaType,
                releaseYear: item.mediaItemReleaseYear,
                title: item.mediaItemTitle,
              }}
              className="absolute inset-0 h-full w-full"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[item.status]}>
                {CONTRIBUTION_STATUS_VALUE_LABELS[item.status]}
              </Badge>
              <MyReviewScore score={item.authorScore} />
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-stone-950">
              {item.mediaItemTitle}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
              {mediaTypeLabel}
            </p>
            <p className="mt-2 text-sm font-semibold text-stone-900">{item.title}</p>
            {item.adminNote ? (
              <p className="mt-1 text-xs text-stone-500">{item.adminNote}</p>
            ) : null}
            <div className="mt-2 text-xs text-stone-600">
              {publishedLabel ?? updatedLabel ?? "—"}
              {updatedLabel && publishedLabel ? (
                <span className="block text-[10px] text-stone-500">
                  обновлено {updatedLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <MyReviewActions item={item} />
        </div>
      </article>
    </>
  )
}
