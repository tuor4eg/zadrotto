"use client"

import { ArrowRight, Plus, Star } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { ArchiveCover } from "@/app/media-item-tile"
import { formatScore } from "@/lib/ratings/score"

export type MediaItemReview = {
  id: number
  authorId: number
  authorName: string
  authorCode: string
  authorAvatarObjectKey: string | null
  authorScore: number | null
  title: string
  body: string
  publishedAt: Date | string | null
  updatedAt: Date | string
  mediaItemTitle?: string | null
  mediaType?: string | null
  mediaItemCarrierCode?: string | null
  mediaItemReleaseYear?: number | null
  coverThumbUrl?: string | null
  coverUrl?: string | null
}

type MediaItemReviewsProps = {
  currentAuthor: {
    name: string
    code: string
  } | null
  mediaItemId: number
  reviews: MediaItemReview[]
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "2-digit",
  }).format(date)
}

export function ReviewAuthorStars({
  compact = false,
  score,
  tone = "dark",
}: {
  compact?: boolean
  score: number | null
  tone?: "dark" | "light"
}) {
  const starRating = (score ?? 0) / 20
  const iconClassName = compact ? "size-3" : "size-6 sm:size-7"
  const starClassName = compact ? "size-3" : "size-6 sm:size-7"
  const emptyClassName = tone === "light" ? "text-stone-50/35" : "text-stone-400/70"
  const filledClassName = tone === "light" ? "text-stone-50" : "text-stone-950"

  return (
    <div
      aria-label={score === null ? "Оценка автора не указана" : `Оценка автора: ${formatScore(score)} из 10`}
      className={`flex items-center justify-center gap-0.5 ${filledClassName}`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fillPercent = Math.max(0, Math.min(100, (starRating - index) * 100))

        return (
          <span key={index} className={`relative ${starClassName}`}>
            <Star className={`absolute inset-0 ${emptyClassName} ${iconClassName}`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
              <Star className={`fill-current ${iconClassName}`} />
            </span>
          </span>
        )
      })}
    </div>
  )
}

function ReviewQuotePreview({
  body,
  className,
}: {
  body: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLParagraphElement>(null)
  const normalizedBody = body.trim()
  const fullText = `«${normalizedBody}»`
  const [previewText, setPreviewText] = useState(fullText)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current

    if (!container || !content) {
      return
    }

    const fits = (text: string) => {
      content.textContent = text
      return content.scrollHeight <= container.clientHeight + 1
    }

    const updatePreview = () => {
      if (container.clientHeight <= 0 || fits(fullText)) {
        setPreviewText(fullText)
        return
      }

      let lowerBound = 0
      let upperBound = normalizedBody.length
      let fittedText = "«…»"

      while (lowerBound <= upperBound) {
        const middle = Math.floor((lowerBound + upperBound) / 2)
        const candidate = `«${normalizedBody.slice(0, middle).trimEnd()}…»`

        if (fits(candidate)) {
          fittedText = candidate
          lowerBound = middle + 1
        } else {
          upperBound = middle - 1
        }
      }

      content.textContent = fittedText
      setPreviewText(fittedText)
    }

    updatePreview()
    void document.fonts?.ready.then(updatePreview)
    const resizeObserver = new ResizeObserver(updatePreview)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [fullText, normalizedBody])

  return (
    <div
      ref={containerRef}
      className={
        className ??
        "relative z-10 min-h-0 flex-1 overflow-hidden text-[10px] leading-[1.5] text-stone-800 sm:text-[11px]"
      }
    >
      <p ref={contentRef}>{previewText}</p>
    </div>
  )
}

function polaroidTiltClassName(index: number) {
  if (index % 3 === 1) {
    return "rotate-[0.8deg]"
  }

  if (index % 3 === 2) {
    return "-rotate-[0.6deg]"
  }

  return ""
}

function MediaItemReviewCoverCard({
  index = 0,
  review,
}: {
  index?: number
  review: MediaItemReview
}) {
  const publishedAt = formatDate(review.publishedAt ?? review.updatedAt)
  const mediaItemTitle = review.mediaItemTitle?.trim() || review.title
  const coverUrl = review.coverThumbUrl ?? review.coverUrl ?? null

  return (
    <Link
      href={`/reviews/${review.id}`}
      className={`relative flex aspect-square min-w-0 cursor-pointer flex-col overflow-hidden border border-stone-300/80 bg-white text-left shadow-[0_7px_14px_rgba(68,64,60,0.18)] transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${polaroidTiltClassName(index)}`}
      aria-label={`Открыть рецензию на «${mediaItemTitle}», автор ${review.authorName}`}
    >
      <span
        className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/3 rotate-[-2deg] bg-amber-100/65 shadow-sm h-6 w-16"
        aria-hidden="true"
      />
      <span className="absolute inset-[7px] overflow-hidden bg-stone-200" aria-hidden="true">
        <ArchiveCover
          carrierFrame={false}
          item={{
            coverUrl,
            mediaCarrierCode: review.mediaItemCarrierCode,
            mediaType: review.mediaType ?? undefined,
            releaseYear: review.mediaItemReleaseYear,
            title: mediaItemTitle,
          }}
          className="absolute inset-0 h-full w-full"
        />
        <span className="absolute inset-0 bg-stone-950/25" />
        <span className="absolute inset-x-0 bottom-0 h-4/5 bg-gradient-to-t from-black/95 via-black/70 to-transparent" />
      </span>
      <div className="absolute inset-[7px] z-10 flex flex-col justify-end px-2.5 pb-1.5 pt-2.5 text-stone-50 sm:px-3 sm:pb-2 sm:pt-3">
        <h3 className="line-clamp-2 font-serif text-sm leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] sm:text-[15px]">
          {mediaItemTitle}
        </h3>
        <ReviewQuotePreview
          body={review.body}
          className="mt-1.5 h-[3.6rem] shrink-0 overflow-hidden text-[10px] leading-[1.4] text-stone-50/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:h-[4.2rem] sm:text-[11px]"
        />
        <div className="mt-2 flex items-end justify-between gap-2 text-[10px] leading-tight text-stone-100/85 sm:text-[11px]">
          <span className="min-w-0 truncate drop-shadow">{review.authorName}</span>
          <span className="shrink-0 drop-shadow">{publishedAt ?? "Рецензия"}</span>
        </div>
        <div className="mt-1.5 border-t border-stone-50/25 pt-1">
          <ReviewAuthorStars compact score={review.authorScore} tone="light" />
        </div>
      </div>
    </Link>
  )
}

export function MediaItemReviewCard({
  compact = false,
  index = 0,
  review,
  variant = "paper",
}: {
  compact?: boolean
  index?: number
  review: MediaItemReview
  variant?: "paper" | "cover"
}) {
  if (variant === "cover") {
    return <MediaItemReviewCoverCard index={index} review={review} />
  }

  const publishedAt = formatDate(review.publishedAt ?? review.updatedAt)

  return (
    <Link
      href={`/reviews/${review.id}`}
      className={`archive-typewriter-text relative flex aspect-square min-w-0 cursor-pointer flex-col border border-stone-300/80 bg-white text-left shadow-[0_7px_14px_rgba(68,64,60,0.18)] transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
        compact
          ? "px-2.5 pb-1.5 pt-2.5"
          : "px-4 pb-2.5 pt-4 sm:px-[18px] sm:pb-2.5 sm:pt-4"
      } ${polaroidTiltClassName(index)}`}
      aria-label={`Открыть рецензию «${review.title}», автор ${review.authorName}`}
    >
      <span
        className={`pointer-events-none absolute border border-stone-200/80 bg-[#eee6d7] shadow-[inset_0_0_12px_rgba(120,113,108,0.08)] ${
          compact ? "inset-[4px]" : "inset-[7px]"
        }`}
        aria-hidden="true"
      />
      <span
        className={`absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/3 rotate-[-2deg] bg-amber-100/65 shadow-sm ${
          compact ? "h-3.5 w-10" : "h-6 w-16"
        }`}
        aria-hidden="true"
      />
      <ReviewQuotePreview body={review.body} />
      <div className="relative z-10 mt-1 shrink-0">
        <div
          className={`mb-1 line-clamp-2 font-semibold text-stone-950 ${
            compact ? "text-[9px] leading-3" : "text-[11px] leading-4 sm:text-xs"
          }`}
        >
          {review.title}
        </div>
        <div
          className={`flex items-end justify-between gap-1 text-stone-600 ${
            compact ? "text-[9px] leading-3" : "gap-2 text-[11px] leading-4 sm:text-xs"
          }`}
        >
          <span className="min-w-0 truncate">{review.authorName}</span>
          <span className="shrink-0">{publishedAt ?? "Рецензия"}</span>
        </div>
        <div className="mt-0 border-t border-stone-200 pt-0.5">
          <ReviewAuthorStars compact score={review.authorScore} />
        </div>
      </div>
    </Link>
  )
}

function ReviewActionStack({
  currentAuthor,
  hiddenReviewsCount,
  mediaItemId,
}: {
  currentAuthor: MediaItemReviewsProps["currentAuthor"]
  hiddenReviewsCount: number
  mediaItemId: number
}) {
  const href = currentAuthor ? `/reviews/new?mediaItemId=${mediaItemId}` : "/author/login"
  const ariaLabel = currentAuthor
    ? "Поделиться мнением"
    : "Войти как автор, чтобы поделиться мнением"

  return (
    <div className="relative aspect-square min-w-0">
      <div className="absolute inset-x-1 bottom-0 top-3 rotate-[4deg] border border-stone-300/80 bg-[#f5f0e5] shadow-md" />
      <div className="absolute inset-x-0 bottom-1 top-1 -rotate-[2deg] border border-stone-300/80 bg-[#faf6ec] shadow-md" />
      <div className="absolute inset-0 flex flex-col items-center justify-center border border-stone-300/90 bg-white px-3 text-center shadow-[0_8px_16px_rgba(68,64,60,0.2)]">
        <span className="pointer-events-none absolute inset-[7px] border border-stone-200/80 bg-[#eee6d7] shadow-[inset_0_0_12px_rgba(120,113,108,0.08)]" aria-hidden="true" />
        <Link
          href={href}
          className="group absolute left-1/2 top-1/2 z-10 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-stone-700 transition-[color,transform] hover:scale-110 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950 sm:size-16"
          aria-label={ariaLabel}
        >
          <Plus className="size-10 stroke-[1.5] sm:size-12" aria-hidden="true" />
          <span className="sr-only">Создать новую рецензию</span>
        </Link>
        {hiddenReviewsCount > 0 ? (
          <button
            type="button"
            disabled
            className="absolute inset-x-3 bottom-3 z-10 flex cursor-default items-center justify-center gap-2 font-mono text-[9px] font-semibold leading-4 text-stone-700 sm:text-[10px]"
            aria-label={`Ещё ${hiddenReviewsCount} мнений — переход пока недоступен`}
          >
            <span>Ещё {hiddenReviewsCount} мнений</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function MediaItemReviews({
  currentAuthor,
  mediaItemId,
  reviews,
}: MediaItemReviewsProps) {
  if (!currentAuthor && reviews.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Мнения
      </h2>

      <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 px-1 py-3">
        {reviews.slice(0, 3).map((review, index) => (
          <MediaItemReviewCard key={review.id} index={index} review={review} />
        ))}
        <ReviewActionStack
          currentAuthor={currentAuthor}
          hiddenReviewsCount={Math.max(0, reviews.length - 3)}
          mediaItemId={mediaItemId}
        />
      </div>
    </section>
  )
}
