"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AchievementCard,
  selectRecentAwardedAchievements,
  type AchievementShowcaseItem,
} from "./achievement-card";

const CARD_MIN_WIDTH = 196
const CARD_GAP = 8

export function RecentAchievementShowcase({
  allHref,
  items,
}: {
  allHref: string;
  items: AchievementShowcaseItem[];
}) {
  const recent = selectRecentAwardedAchievements(items)
  const rowRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(5)

  useEffect(() => {
    const node = rowRef.current
    if (!node) return

    function updateVisibleCount() {
      const width = node!.clientWidth
      if (width <= 0) return
      setVisibleCount(Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP))))
    }

    updateVisibleCount()
    const observer = new ResizeObserver(updateVisibleCount)
    observer.observe(node)
    return () => observer.disconnect()
  }, [recent.length])

  const visibleItems = recent.slice(0, visibleCount)

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
        <div ref={rowRef} className="min-w-0">
          <div
            className="grid overflow-hidden"
            style={{ gap: CARD_GAP, gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
          >
            {visibleItems.map((item) => <AchievementCard key={item.code} item={item} />)}
          </div>
        </div>
      )}
    </section>
  )
}
