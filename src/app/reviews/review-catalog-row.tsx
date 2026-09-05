import Link from "next/link"

import { ArchiveCover } from "@/app/media-item-tile"
import { Avatar } from "@/components/ui/avatar"
import { formatRelativeArchiveDate } from "@/lib/archive/relative-date"
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types"
import { formatScore } from "@/lib/ratings/score"
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone"

export type ReviewCatalogRowItem = {
  id: number
  authorId: number
  authorName: string
  authorAvatarObjectKey: string | null
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

export function ReviewCatalogRow({
  item,
  mediaTypes,
}: {
  item: ReviewCatalogRowItem
  mediaTypes: readonly MediaTypeOption[]
}) {
  const mediaTypeLabel = getMediaTypeLabel(item.mediaType, mediaTypes)
  const publishedLabel = formatRelativeArchiveDate(item.publishedAt ?? item.updatedAt)
  const ratingToneClassName = AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(item.authorScore)]

  return (
    <Link
      href={`/reviews/${item.id}`}
      className="group grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1.35fr)_minmax(5.5rem,8rem)_2.25rem] items-center gap-x-2 border-b border-stone-300/60 px-2 py-2 transition-colors last:border-b-0 hover:bg-stone-50/50 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(7.5rem,9.5rem)_2.75rem] sm:gap-x-4 sm:px-3"
      aria-label={`Рецензия «${item.title}» на «${item.mediaItemTitle}», автор ${item.authorName}`}
    >
      <span className="relative block aspect-[2/3] w-11 overflow-hidden rounded border border-stone-300/80 bg-stone-100 shadow-sm sm:w-12">
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

      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight text-stone-950 group-hover:underline group-hover:underline-offset-4">
          {item.mediaItemTitle}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
          {mediaTypeLabel}
        </span>
      </span>

      <span className="min-w-0 truncate text-sm font-semibold leading-snug text-stone-900">
        {item.title}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <Avatar
          name={item.authorName}
          objectKey={item.authorAvatarObjectKey}
          className="hidden size-7 shrink-0 text-[9px] sm:inline-grid"
        />
        <span className="min-w-0">
          <span className="block truncate text-xs leading-tight text-stone-800 sm:text-sm">
            {item.authorName}
          </span>
          {publishedLabel ? (
            <span className="mt-0.5 block truncate text-[10px] leading-tight text-stone-500 sm:text-xs">
              {publishedLabel}
            </span>
          ) : null}
        </span>
      </span>

      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center justify-self-end rounded-md border font-mono text-sm tabular-nums shadow-sm sm:size-10 sm:text-base ${ratingToneClassName}`}
        aria-label={
          item.authorScore === null
            ? "Оценка автора не указана"
            : `Оценка автора: ${formatScore(item.authorScore)}`
        }
      >
        {formatScore(item.authorScore)}
      </span>
    </Link>
  )
}
