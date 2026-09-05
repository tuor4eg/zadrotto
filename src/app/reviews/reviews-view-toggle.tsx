import Link from "next/link"

import type { ReviewCatalogView } from "./reviews-catalog-logic"

type ReviewsViewToggleProps = {
  view: ReviewCatalogView
}

export function ReviewsViewToggle({ view }: ReviewsViewToggleProps) {
  return (
    <nav
      aria-label="Режим списка рецензий"
      className="inline-flex rounded-md border border-stone-300/80 bg-stone-50/70 p-0.5"
    >
      <Link
        href="/reviews"
        aria-current={view === "all" ? "page" : undefined}
        className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
          view === "all"
            ? "bg-stone-900 text-stone-50"
            : "text-stone-700 hover:text-stone-950"
        }`}
      >
        Все рецензии
      </Link>
      <Link
        href="/reviews?view=mine"
        aria-current={view === "mine" ? "page" : undefined}
        className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
          view === "mine"
            ? "bg-stone-900 text-stone-50"
            : "text-stone-700 hover:text-stone-950"
        }`}
      >
        Мои рецензии
      </Link>
    </nav>
  )
}
