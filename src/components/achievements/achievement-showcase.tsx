import { Trophy } from "lucide-react"

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
  const sortedItems = [...items].sort((left, right) => Number(Boolean(right.awardedAt)) - Number(Boolean(left.awardedAt)))

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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {sortedItems.map((item) => <AchievementCard key={item.code} browseAwardedLevels fillWidth item={item} />)}
        </div>
      )}
    </section>
  )
}
