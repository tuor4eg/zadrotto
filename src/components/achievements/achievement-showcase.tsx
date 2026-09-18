import { Trophy } from "lucide-react"

import { sortAchievementsByAwardedAt } from "@/lib/achievements/showcase"

import {
  AchievementCard,
  type AchievementShowcaseItem,
} from "./achievement-card"

export function AchievementShowcase({
  emptyText = "Ачивки пока не получены.",
  items,
  title = "Ачивки",
}: {
  emptyText?: string
  items: AchievementShowcaseItem[]
  title?: string
}) {
  const sortedItems = sortAchievementsByAwardedAt(items)

  return (
    <section aria-labelledby="achievements-title">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2 id="achievements-title" className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
          <Trophy className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          {title}
        </h2>
      </div>
      {sortedItems.length === 0 ? (
        <p className="text-sm text-stone-600">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
          {sortedItems.map((item) => <AchievementCard key={item.code} browseAwardedLevels fillWidth item={item} />)}
        </div>
      )}
    </section>
  )
}
