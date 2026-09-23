"use client"

import { useEffect, useRef, useState } from "react"

import { MediaItemReviewCard, type MediaItemReview } from "@/app/media-item-reviews"

const COVER_REVIEW_CARD_WIDTH = 240
const PAPER_REVIEW_CARD_WIDTH = 200
const REVIEW_CARD_GAP = 12

function getVisibleCardCount(containerWidth: number, cardWidth: number) {
  return Math.max(
    1,
    Math.floor((containerWidth + REVIEW_CARD_GAP) / (cardWidth + REVIEW_CARD_GAP)),
  )
}

export function ReviewPolaroidRow({
  mobileScrollable = false,
  reviews,
  showMediaItemTitle = false,
  variant = "paper",
}: {
  mobileScrollable?: boolean
  reviews: MediaItemReview[]
  showMediaItemTitle?: boolean
  variant?: "cover" | "paper"
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [visibleCardCount, setVisibleCardCount] = useState(1)
  const cardWidth = variant === "paper" ? PAPER_REVIEW_CARD_WIDTH : COVER_REVIEW_CARD_WIDTH

  useEffect(() => {
    const row = rowRef.current
    if (!row) return

    const updateVisibleCardCount = (width: number) => {
      setVisibleCardCount(getVisibleCardCount(width, cardWidth))
    }
    const observer = new ResizeObserver(([entry]) => {
      updateVisibleCardCount(entry.contentRect.width)
    })

    updateVisibleCardCount(row.getBoundingClientRect().width)
    observer.observe(row)

    return () => observer.disconnect()
  }, [cardWidth])

  return (
    <div
      ref={rowRef}
      className={mobileScrollable
        ? "grid grid-flow-col auto-cols-[calc((100%_-_0.75rem)/2)] justify-start gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-[repeat(var(--review-columns),var(--review-card-width))] sm:overflow-hidden sm:pb-0"
        : "grid justify-start overflow-hidden"}
      style={mobileScrollable
        ? {
            "--review-card-width": `${cardWidth}px`,
            "--review-columns": visibleCardCount,
          } as React.CSSProperties
        : {
            gap: `${REVIEW_CARD_GAP}px`,
            gridTemplateColumns: `repeat(${visibleCardCount}, ${cardWidth}px)`,
          }}
    >
      {reviews.slice(0, mobileScrollable ? 5 : visibleCardCount).map((review, index) => {
        const card = (
          <MediaItemReviewCard
            key={review.id}
            index={index}
            review={review}
            showMediaItemTitle={showMediaItemTitle}
            variant={variant}
          />
        )

        return mobileScrollable ? (
          <div key={review.id} className={index >= visibleCardCount ? "min-w-0 sm:hidden" : "min-w-0"}>
            {card}
          </div>
        ) : card
      })}
    </div>
  )
}
