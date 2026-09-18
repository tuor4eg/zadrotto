import Image from "next/image"
import { History, Trophy } from "lucide-react"

import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"
import {
  formatAchievementHistoryDate,
  listAchievementHistoryEntries,
} from "@/lib/achievements/showcase"

const HIDDEN_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

export function AchievementAwardHistory({
  items,
}: {
  items: AchievementShowcaseItem[]
}) {
  const entries = listAchievementHistoryEntries(items)

  return (
    <section
      aria-labelledby="achievement-history-title"
      className="archive-paper archive-panel flex h-full max-h-[28rem] min-h-0 flex-col overflow-hidden p-4 sm:p-5 lg:max-h-none"
    >
      <div className="mb-4 shrink-0 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2
          id="achievement-history-title"
          className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"
        >
          <History className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          История достижений
        </h2>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-stone-600">Пока нет полученных ачивок.</p>
      ) : (
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${HIDDEN_SCROLLBAR}`}>
          <ol className="relative ml-1.5 border-l border-stone-400/70">
            {entries.map((entry) => (
              <li
                key={entry.key}
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
                    <p className="text-sm font-semibold leading-5 text-stone-950">
                      {entry.name}
                    </p>
                    {entry.levelCount > 1 ? (
                      <p className="mt-0.5 text-xs leading-4 text-stone-700">
                        Ур. {entry.level}
                      </p>
                    ) : null}
                    {entry.description ? (
                      <p className="mt-1 text-xs leading-4 text-stone-500">
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
