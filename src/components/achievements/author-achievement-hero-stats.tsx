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
    </div>
  )
}
