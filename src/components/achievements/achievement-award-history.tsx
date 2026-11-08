"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { History, Trophy } from "lucide-react"

import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"
import {
  formatAchievementHistoryDate,
  listAchievementHistoryEntries,
} from "@/lib/achievements/showcase"

export const ACHIEVEMENT_HISTORY_ROW_HEIGHT = 128

export function getAchievementHistoryLimit(height: number, chromeHeight: number) {
  return Math.max(0, Math.floor((height - chromeHeight) / ACHIEVEMENT_HISTORY_ROW_HEIGHT))
}

export function AchievementAwardHistory({
  items,
  maxHeight,
}: {
  items: AchievementShowcaseItem[]
  maxHeight: number | null
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [chromeHeight, setChromeHeight] = useState<number | null>(null)
  useEffect(() => {
    const section = sectionRef.current
    const header = headerRef.current
    if (!section || !header) return
    const measure = () => {
      const sectionStyle = getComputedStyle(section)
      const headerStyle = getComputedStyle(header)
      setChromeHeight(header.getBoundingClientRect().height + parseFloat(headerStyle.marginBottom)
        + parseFloat(sectionStyle.paddingTop) + parseFloat(sectionStyle.paddingBottom)
        + parseFloat(sectionStyle.borderTopWidth) + parseFloat(sectionStyle.borderBottomWidth))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    observer.observe(section)
    measure()
    return () => observer.disconnect()
  }, [])
  const limit = maxHeight === null || chromeHeight === null ? null : getAchievementHistoryLimit(maxHeight, chromeHeight)
  const entries = useMemo(() => limit === null || limit === 0 ? [] : listAchievementHistoryEntries(items).slice(0, limit), [items, limit])
  const hasAwards = items.some(item => item.awardedLevels.length > 0)

  return (
    <section
      ref={sectionRef}
      aria-labelledby="achievement-history-title"
      aria-busy={limit === null}
      style={maxHeight === null ? undefined : { maxHeight }}
      className="archive-paper archive-panel flex min-h-0 flex-col overflow-hidden p-4 sm:p-5 lg:max-h-none"
    >
      <div ref={headerRef} className="mb-4 shrink-0 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2
          id="achievement-history-title"
          className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"
        >
          <History className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          История достижений
        </h2>
      </div>

      {limit === null ? (
        <p className="text-sm text-stone-500" role="status">Загружаем историю…</p>
      ) : !hasAwards ? (
        <p className="text-sm text-stone-600">Пока нет полученных ачивок.</p>
      ) : (
        <div className="min-h-0 overflow-hidden">
          <ol className="relative ml-1.5 border-l border-stone-400/70">
            {entries.map((entry) => (
              <li
                key={entry.key}
                style={{ height: ACHIEVEMENT_HISTORY_ROW_HEIGHT }}
                className="relative border-b border-stone-300/50 py-3.5 pl-5 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-[1.35rem] left-0 size-2 -translate-x-1/2 rounded-full bg-stone-600"
                />
                <div className="flex min-w-0 items-start gap-3">
                  <time
                    className="w-[4.75rem] shrink-0 pt-1.5 text-xs leading-4 text-stone-500 tabular-nums"
                    dateTime={new Date(entry.awardedAt).toISOString()}
                  >
                    {formatAchievementHistoryDate(entry.awardedAt)}
                  </time>
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-amber-800/35 bg-stone-100 shadow-sm">
                    {entry.imageUrl ? (
                      <Image
                        alt=""
                        className="object-cover"
                        fill
                        sizes="44px"
                        src={entry.imageUrl}
                        unoptimized
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-amber-800">
                        <Trophy className="size-5" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-stone-950">
                      {entry.name}
                    </p>
                    {entry.levelCount > 1 ? (
                      <p className="mt-0.5 text-xs leading-4 text-stone-700">
                        Ур. {entry.level}
                      </p>
                    ) : null}
                    {entry.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-4 text-stone-500">
                        {entry.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
