"use client"

import Link from "next/link"
import { Trophy } from "lucide-react"

import {
  AchievementCard,
  selectRecentAwardedAchievements,
  type AchievementShowcaseItem,
} from "./achievement-card"

const RECENT_ACHIEVEMENT_LIMIT = 5

export function RecentAchievementShowcase({
  allHref,
  items,
}: {
  allHref: string
  items: AchievementShowcaseItem[]
}) {
  const recent = selectRecentAwardedAchievements(items).slice(0, RECENT_ACHIEVEMENT_LIMIT)

  return (
    <section className="archive-paper archive-panel p-4 sm:p-5" aria-labelledby="recent-achievements-title">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2 id="recent-achievements-title" className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
          <Trophy className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          Последние ачивки
        </h2>
        <Link href={allHref} className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">
          Смотреть всё →
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-stone-600">Пока нет полученных ачивок.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {recent.map((item) => <AchievementCard key={item.code} browseAwardedLevels fillWidth item={item} />)}
        </div>
      )}
    </section>
  )
}
