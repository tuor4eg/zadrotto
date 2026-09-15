import { BadgeCheck, ChartColumnIncreasing, Trophy } from "lucide-react"

export function AuthorAchievementHeroStats({
  completedCount,
  earnedCount,
  inProgressCount,
}: {
  completedCount: number
  earnedCount: number
  inProgressCount: number
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
    <div className="mt-6 flex flex-nowrap items-end justify-between gap-2 sm:mt-8 sm:justify-start sm:gap-12">
      <dl className="contents">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.label} className="flex min-w-0 items-center gap-1 sm:gap-3">
              <Icon className={`size-5 shrink-0 sm:size-10 ${item.iconClassName}`} aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <dt className="order-2 mt-1 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.04em] text-stone-600 sm:text-[9px] sm:tracking-[0.12em]">
                  {item.label}
                </dt>
                <dd className="order-1 font-serif text-xl leading-none tabular-nums text-stone-950 sm:text-3xl">
                  {item.value.toLocaleString("ru-RU")}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
