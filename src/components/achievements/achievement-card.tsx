"use client"

import Image from "next/image"
import { ChevronLeft, ChevronRight, LockKeyhole, Trophy } from "lucide-react"
import { useRef, useState } from "react"

export const ACHIEVEMENT_CARD_HEIGHT_PX = 148
export const ACHIEVEMENT_CARD_WIDTH_PX = ACHIEVEMENT_CARD_HEIGHT_PX * 2
export const ACHIEVEMENT_CARD_GAP_PX = 8
const SWIPE_THRESHOLD_PX = 40

export type AchievementAwardedLevel = {
  awardedAt: Date | string
  description: string | null
  imageUrl: string | null
  level: number
  name: string
}

export type AchievementShowcaseItem = {
  awardedAt: Date | string | null
  awardedLevels: AchievementAwardedLevel[]
  code: string
  currentValue: number
  description: string | null
  highestAwardedLevel: number | null
  imageUrl: string | null
  levelCount: number
  name: string
  nextLevel: number | null
  nextThreshold: number | null
}

type AchievementCardSlide = {
  awardedAt: Date | string | null
  description: string | null
  imageUrl: string | null
  level: number | null
  name: string
  showProgress: boolean
}

function formatAwardedAt(value: Date | string) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Europe/Moscow",
  }).formatToParts(new Date(value))
  const day = parts.find((part) => part.type === "day")?.value
  const month = parts.find((part) => part.type === "month")?.value?.replace(".", "")
  const year = parts.find((part) => part.type === "year")?.value
  return `${day} ${month} ${year}`
}

function formatLevel(item: { highestAwardedLevel: number | null; levelCount: number; nextLevel: number | null }) {
  if (item.levelCount <= 1) return null
  const level = item.highestAwardedLevel ?? item.nextLevel
  return level ? `ур.${level}` : null
}

function formatReceivedAt(item: { awardedAt: Date | string | null }) {
  if (!item.awardedAt) return null
  return `Получена ${formatAwardedAt(item.awardedAt)}`
}

export function selectRecentAwardedAchievements(items: AchievementShowcaseItem[]) {
  return items
    .filter((item) => item.awardedAt !== null)
    .sort((left, right) => new Date(right.awardedAt!).getTime() - new Date(left.awardedAt!).getTime())
}

function hasVisibleProgress(threshold: number | null): threshold is number {
  return threshold !== null && threshold > 1
}

function getCardSlides(item: AchievementShowcaseItem, canBrowse: boolean): AchievementCardSlide[] {
  if (canBrowse) {
    return item.awardedLevels.map((level, index) => ({
      awardedAt: level.awardedAt,
      description: level.description,
      imageUrl: level.imageUrl,
      level: level.level,
      name: level.name,
      showProgress: index === item.awardedLevels.length - 1 && hasVisibleProgress(item.nextThreshold),
    }))
  }

  return [{
    awardedAt: item.awardedAt,
    description: item.description,
    imageUrl: item.imageUrl,
    level: item.highestAwardedLevel ?? item.nextLevel,
    name: item.name,
    showProgress: hasVisibleProgress(item.nextThreshold),
  }]
}

function AchievementCardPanel({
  isAwarded,
  item,
  slide,
}: {
  isAwarded: boolean
  item: AchievementShowcaseItem
  slide: AchievementCardSlide
}) {
  const level = formatLevel({
    highestAwardedLevel: slide.level,
    levelCount: item.levelCount,
    nextLevel: item.nextLevel,
  })
  const receivedAt = formatReceivedAt(slide)
  const nextThreshold = item.nextThreshold
  const showProgress = slide.showProgress && hasVisibleProgress(nextThreshold)

  return (
    <div className="grid h-full w-full shrink-0 basis-full grid-cols-2">
      <div
        className={`grid min-h-0 min-w-0 place-items-center p-1.5 ${
          isAwarded ? "text-amber-800" : "text-stone-400"
        }`}
      >
        <div className="relative h-full w-full overflow-hidden rounded-sm">
          {slide.imageUrl ? (
            <Image
              alt=""
              className="object-cover"
              fill
              sizes={`${ACHIEVEMENT_CARD_HEIGHT_PX}px`}
              src={slide.imageUrl}
              unoptimized
            />
          ) : isAwarded ? (
            <span className="grid h-full w-full place-items-center">
              <Trophy className="size-8" />
            </span>
          ) : (
            <span className="grid h-full w-full place-items-center">
              <LockKeyhole className="size-8" />
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col py-2.5 pr-2.5">
        <h3 className="line-clamp-2 text-sm font-bold leading-4 text-stone-950">
          {level ? `${slide.name} (${level})` : slide.name}
        </h3>
        <p className="mt-1 line-clamp-3 min-h-0 flex-1 text-xs leading-4">{slide.description}</p>
        <div className="mt-auto grid gap-1 pt-1">
          {receivedAt ? (
            <p className="font-mono text-[10px] uppercase tracking-wider">
              {receivedAt}
            </p>
          ) : null}
          {showProgress ? (
            <div className="grid gap-0.5">
              <div
                className={`h-1.5 overflow-hidden rounded-full ${
                  isAwarded ? "bg-amber-800/15" : "bg-stone-300/80"
                }`}
                role="progressbar"
                aria-label="Прогресс до следующего уровня"
                aria-valuemin={0}
                aria-valuemax={nextThreshold}
                aria-valuenow={Math.min(item.currentValue, nextThreshold)}
              >
                <div
                  className={`h-full rounded-full ${
                    isAwarded ? "bg-amber-700" : "bg-stone-500"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, (item.currentValue / nextThreshold) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-stone-600">
                {item.currentValue} из {nextThreshold}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function AchievementCard({
  browseAwardedLevels = false,
  fillWidth = false,
  item,
}: {
  browseAwardedLevels?: boolean
  fillWidth?: boolean
  item: AchievementShowcaseItem
}) {
  const canBrowse = browseAwardedLevels && item.awardedLevels.length > 1
  const slides = getCardSlides(item, canBrowse)
  const currentIndex = slides.length - 1
  const [viewIndex, setViewIndex] = useState(currentIndex)
  const isAwarded = item.awardedAt !== null
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  function clearPointer(event: { currentTarget: HTMLElement; pointerId: number }) {
    pointerStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <article
      className={`group relative overflow-hidden rounded-md border ${
        isAwarded
          ? "border-amber-700/35 bg-amber-50/55"
          : "border-stone-300/80 bg-stone-100/45 text-stone-500"
      } ${fillWidth ? "w-full" : "shrink-0"} ${canBrowse ? "touch-pan-y" : ""}`}
      onPointerDown={canBrowse ? (event) => {
        if (event.pointerType === "mouse") return
        event.currentTarget.setPointerCapture(event.pointerId)
        pointerStart.current = { x: event.clientX, y: event.clientY }
      } : undefined}
      onPointerUp={canBrowse ? (event) => {
        const start = pointerStart.current
        clearPointer(event)
        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return
        if (dx < 0) setViewIndex((index) => Math.min(currentIndex, index + 1))
        else setViewIndex((index) => Math.max(0, index - 1))
      } : undefined}
      onPointerCancel={canBrowse ? clearPointer : undefined}
      style={
        fillWidth
          ? { aspectRatio: "2 / 1" }
          : {
              width: ACHIEVEMENT_CARD_WIDTH_PX,
              height: ACHIEVEMENT_CARD_HEIGHT_PX,
            }
      }
    >
      <div
        className={`flex h-full ${canBrowse ? "transition-transform duration-300 ease-out" : ""}`}
        style={{ transform: `translateX(-${viewIndex * 100}%)` }}
      >
        {slides.map((slide, index) => (
          <AchievementCardPanel
            key={`${item.code}-${slide.level ?? "locked"}-${index}`}
            isAwarded={isAwarded}
            item={item}
            slide={slide}
          />
        ))}
      </div>
      {canBrowse ? (
        <>
          {viewIndex > 0 ? (
            <button
              type="button"
              aria-label="Предыдущий уровень"
              className="absolute left-1 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-stone-950/20 bg-stone-950/40 text-white/90 opacity-0 shadow-sm pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-stone-950/55"
              onClick={() => setViewIndex((index) => Math.max(0, index - 1))}
            >
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          {viewIndex < currentIndex ? (
            <button
              type="button"
              aria-label="Следующий уровень"
              className="absolute right-1 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-stone-950/20 bg-stone-950/40 text-white/90 opacity-0 shadow-sm pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-stone-950/55"
              onClick={() => setViewIndex((index) => Math.min(currentIndex, index + 1))}
            >
              <ChevronRight className="size-4" />
            </button>
          ) : null}
        </>
      ) : null}
    </article>
  )
}
