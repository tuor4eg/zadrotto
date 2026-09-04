"use client"

import { useEffect, useRef, useState } from "react"
import { Star } from "lucide-react"

import {
  MediaItemReviewCard,
  type MediaItemReview,
} from "@/app/media-item-reviews"

const FEATURED_CARD_WIDTH = 240
const FEATURED_CARD_GAP = 12

function getFeaturedColumnCount(containerWidth: number) {
  return Math.max(
    1,
    Math.floor((containerWidth + FEATURED_CARD_GAP) / (FEATURED_CARD_WIDTH + FEATURED_CARD_GAP)),
  )
}

type FeaturedReviewsProps = {
  reviews: MediaItemReview[]
}

export function FeaturedReviews({ reviews }: FeaturedReviewsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(3)

  useEffect(() => {
    const grid = gridRef.current

    if (!grid) {
      return
    }

    const updateColumnCount = (width: number) => {
      setColumnCount(getFeaturedColumnCount(width))
    }
    const observer = new ResizeObserver(([entry]) => {
      updateColumnCount(entry.contentRect.width)
    })

    updateColumnCount(grid.getBoundingClientRect().width)
    observer.observe(grid)

    return () => observer.disconnect()
  }, [])

  if (reviews.length === 0) {
    return null
  }

  const visibleReviews = reviews.slice(0, columnCount)

  return (
    <section aria-labelledby="featured-reviews-title" className="relative z-0 border-b border-stone-300/60 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <Star className="size-4 text-amber-700" aria-hidden="true" />
        <h2
          id="featured-reviews-title"
          className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
        >
          Избранные рецензии
        </h2>
      </div>
      <p className="mt-1 text-sm text-stone-600">Последние опубликованные мнения</p>
      <div
        ref={gridRef}
        className="mt-4 grid justify-start"
        style={{
          gap: `${FEATURED_CARD_GAP}px`,
          gridTemplateColumns: `repeat(${columnCount}, ${FEATURED_CARD_WIDTH}px)`,
        }}
      >
        {visibleReviews.map((review, index) => (
          <MediaItemReviewCard key={review.id} index={index} review={review} variant="cover" />
        ))}
      </div>
    </section>
  )
}
