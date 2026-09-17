import { Flame, Gamepad2, Trophy } from "lucide-react";

export function QuizHeroStatistics({
  currentCorrectStreak,
  playedCount,
  winnerCount,
}: {
  currentCorrectStreak: number;
  playedCount: number;
  winnerCount: number;
}) {
  const items = [
    {
      icon: Gamepad2,
      iconClassName: "text-red-950/70",
      label: "Сыграно",
      value: playedCount,
    },
    {
      icon: Trophy,
      iconClassName: "text-amber-700",
      label: "Побед",
      value: winnerCount,
    },
    {
      icon: Flame,
      iconClassName: "text-orange-700",
      label: "Текущая серия",
      value: currentCorrectStreak,
    },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="mt-auto flex flex-nowrap items-end justify-between gap-2 pt-6 sm:justify-start sm:gap-12">
      <dl className="contents">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="flex min-w-0 items-center gap-1 sm:gap-3">
              <Icon className={`size-9 shrink-0 sm:size-10 ${item.iconClassName}`} aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <dt className="order-2 mt-1 whitespace-nowrap font-mono text-[8px] font-semibold uppercase tracking-[0.04em] text-stone-600 sm:text-[9px] sm:tracking-[0.12em]">
                  {item.label}
                </dt>
                <dd className="order-1 font-serif text-xl leading-none tabular-nums text-stone-950 sm:text-3xl">
                  {item.value.toLocaleString("ru-RU")}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
