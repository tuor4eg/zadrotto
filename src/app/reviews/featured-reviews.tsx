import { Star } from "lucide-react"

import type { MediaItemReview } from "@/app/media-item-reviews"
import { ReviewPolaroidRow } from "@/app/reviews/review-polaroid-row"

type FeaturedReviewsProps = {
  reviews: MediaItemReview[]
}

export function FeaturedReviews({ reviews }: FeaturedReviewsProps) {
  if (reviews.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="featured-reviews-title" className="relative z-0 border-b border-stone-300/60 px-4 py-5 sm:px-6">
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
      <div className="mt-4"><ReviewPolaroidRow reviews={reviews} variant="cover" /></div>
    </section>
  )
}
