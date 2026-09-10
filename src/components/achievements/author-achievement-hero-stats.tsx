import Image from "next/image"
import { BadgeCheck, ChartColumnIncreasing, LockKeyhole, Trophy } from "lucide-react"

import type { AchievementNearestGoal } from "@/lib/achievements/showcase"

function NearestAchievementGoal({ goal }: { goal: AchievementNearestGoal }) {
  const progress = Math.min(100, Math.max(0, (goal.currentValue / goal.nextThreshold) * 100))

  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">
        Ближайшая цель
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center ${
            goal.isAwarded ? "text-amber-800" : "text-stone-400"
          }`}
        >
          <div className="relative size-full">
            {goal.imageUrl ? (
              <Image
                alt=""
                className="object-contain"
                fill
                sizes="40px"
                src={goal.imageUrl}
                unoptimized
              />
            ) : goal.isAwarded ? (
              <span className="grid h-full w-full place-items-center">
                <Trophy className="size-5" />
              </span>
            ) : (
              <span className="grid h-full w-full place-items-center">
                <LockKeyhole className="size-5" />
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-4 text-stone-950">{goal.name}</p>
          {goal.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-stone-600">{goal.description}</p>
          ) : null}
          <div className={`mt-1.5 w-20 ${goal.isAwarded ? "" : "text-center"}`}>
            <p className="text-[10px] tabular-nums text-stone-600">
              {goal.currentValue} / {goal.nextThreshold}
            </p>
            <div
              className={`h-1.5 overflow-hidden rounded-full ${
                goal.isAwarded ? "bg-amber-800/15" : "bg-stone-300/80"
              }`}
              role="progressbar"
              aria-label="Прогресс до следующего уровня"
              aria-valuemin={0}
              aria-valuemax={goal.nextThreshold}
              aria-valuenow={Math.min(goal.currentValue, goal.nextThreshold)}
            >
              <div
                className={`h-full rounded-full ${
                  goal.isAwarded ? "bg-amber-700" : "bg-stone-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuthorAchievementHeroStats({
  completedCount,
  earnedCount,
  inProgressCount,
  nearestGoal,
}: {
  completedCount: number
  earnedCount: number
  inProgressCount: number
  nearestGoal: AchievementNearestGoal | null
}) {
  const items = [
    {
      icon: Trophy,
      iconClassName: "text-amber-700",
      label: "Получено",
      value: earnedCount,
    },
    {
      icon: BadgeCheck,
      iconClassName: "text-emerald-800",
      label: "Завершено",
      value: completedCount,
    },
    {
      icon: ChartColumnIncreasing,
      iconClassName: "text-stone-500",
      label: "В процессе",
      value: inProgressCount,
    },
  ] as const

  return (
    <div className="mt-8 flex flex-wrap items-end gap-8 sm:flex-nowrap sm:gap-12">
      <dl className="contents">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.label} className="flex items-center gap-3">
              <Icon className={`size-10 shrink-0 ${item.iconClassName}`} aria-hidden="true" />
              <div className="flex flex-col">
                <dt className="order-2 mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">
                  {item.label}
                </dt>
                <dd className="order-1 font-serif text-3xl leading-none tabular-nums text-stone-950">
                  {item.value.toLocaleString("ru-RU")}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>
      {nearestGoal ? <NearestAchievementGoal goal={nearestGoal} /> : null}
    </div>
  )
}
