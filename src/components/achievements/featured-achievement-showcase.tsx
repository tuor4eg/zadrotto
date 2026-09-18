import Image from "next/image"
import { BadgeCheck, Trophy } from "lucide-react"

import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"
import {
  resolveFeaturedShowcaseBackgroundUrl,
  selectFeaturedShowcaseAchievements,
} from "@/lib/achievements/featured-showcase"
import {
  ACHIEVEMENT_CARD_IMAGE_PX,
  formatAchievementAwardedAt,
} from "@/lib/achievements/showcase"

function formatLevel(item: AchievementShowcaseItem) {
  if (item.levelCount <= 1 || !item.highestAwardedLevel) return null
  return `ур.${item.highestAwardedLevel}`
}

export function FeaturedAchievementShowcase({
  defaultShowcaseBackgroundImageUrl,
  items,
}: {
  defaultShowcaseBackgroundImageUrl: string | null
  items: AchievementShowcaseItem[]
}) {
  const featured = selectFeaturedShowcaseAchievements(items)
  if (featured.length === 0) return null

  return (
    <section
      aria-labelledby="featured-achievements-title"
      className="archive-paper archive-panel overflow-hidden px-2 py-4 sm:px-10 lg:px-14 lg:py-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
        <h2
          id="featured-achievements-title"
          className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl"
        >
          <Trophy className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          Витрина достижений
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,162,158,.45)_transparent] sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3 xl:grid-cols-5">
        {featured.map((item) => {
          const backgroundUrl = resolveFeaturedShowcaseBackgroundUrl(
            item.showcaseBackgroundImageUrl,
            defaultShowcaseBackgroundImageUrl,
          )
          const level = formatLevel(item)
          const title = level ? `${item.name} (${level})` : item.name

          return (
            <article
              key={item.code}
              className="flex w-[14rem] shrink-0 justify-center sm:w-auto sm:min-w-0"
            >
              <div className="relative aspect-[2/3] w-full max-w-[14rem] overflow-hidden rounded-md">
                <Image
                  alt=""
                  className="object-contain"
                  fill
                  sizes="(max-width: 639px) 14rem, (max-width: 1279px) 28vw, 14vw"
                  src={backgroundUrl}
                  unoptimized
                />
                <div className="absolute inset-0 z-10 grid grid-rows-2 text-stone-50">
                  <div className="grid items-end justify-items-center px-5 pb-0">
                    <div className="relative size-20 sm:size-24">
                      {item.imageUrl ? (
                        <Image
                          alt=""
                          className="object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
                          fill
                          sizes={`${ACHIEVEMENT_CARD_IMAGE_PX}px`}
                          src={item.imageUrl}
                          unoptimized
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-amber-100">
                          <Trophy className="size-12" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative flex h-full flex-col items-center px-5 pb-14 pt-0.5 text-center sm:px-6 sm:pb-14">
                    <h3 className="line-clamp-2 min-h-[2.5rem] w-full shrink-0 font-serif text-lg leading-tight drop-shadow-sm sm:min-h-[2.75rem] sm:text-xl">
                      {title}
                    </h3>
                    <div className="flex min-h-0 w-full flex-1 flex-col items-center">
                      {item.description ? (
                        <p
                          className="mt-1 w-full overflow-hidden px-2 text-xs leading-4 text-stone-100/95 drop-shadow-sm [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]"
                          title={item.description}
                        >
                          {item.description}
                        </p>
                      ) : null}
                      {item.awardedAt ? (
                        <div className="mt-2 flex shrink-0 items-center justify-center gap-1.5">
                          <BadgeCheck className="size-4 shrink-0 text-teal-300" aria-hidden="true" />
                          <p className="text-xs font-medium text-stone-50">Получено</p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-stone-200">
                            {formatAchievementAwardedAt(item.awardedAt)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
