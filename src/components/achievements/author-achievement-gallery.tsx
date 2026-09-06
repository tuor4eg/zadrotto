"use client"

import { useMemo, useState } from "react"

import { AchievementCard, type AchievementShowcaseItem } from "@/components/achievements/achievement-card"
import {
  filterAchievementsByStatus,
  sortAchievementsByAwardedAt,
  type AchievementGalleryFilter,
} from "@/lib/achievements/showcase"
import { cn } from "@/lib/common/utils"

const GALLERY_FILTERS = [
  { id: "all", label: "Все" },
  { id: "earned", label: "Полученные" },
  { id: "completed", label: "Завершено" },
  { id: "in-progress", label: "В процессе" },
  { id: "locked", label: "Неоткрытые" },
] as const satisfies ReadonlyArray<{ id: AchievementGalleryFilter; label: string }>

export function AuthorAchievementGallery({ items }: { items: AchievementShowcaseItem[] }) {
  const [filter, setFilter] = useState<AchievementGalleryFilter>("all")
  const visibleItems = useMemo(
    () => sortAchievementsByAwardedAt(filterAchievementsByStatus(items, filter)),
    [filter, items],
  )

  return (
    <section className="archive-paper archive-panel flex flex-1 flex-col px-6 py-6 sm:px-10 lg:px-14 lg:py-7" aria-label="Список ачивок">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Статус ачивок">
        {GALLERY_FILTERS.map((item) => {
          const selected = filter === item.id

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                selected
                  ? "bg-stone-950 text-stone-50"
                  : "border border-stone-300/80 bg-stone-50/70 text-stone-700 hover:border-stone-700 hover:text-stone-950",
              )}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {visibleItems.length === 0 ? (
        <p className="mt-6 text-sm text-stone-600">Нет ачивок в этом статусе.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {visibleItems.map((item) => (
            <AchievementCard key={item.code} browseAwardedLevels fillWidth item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
