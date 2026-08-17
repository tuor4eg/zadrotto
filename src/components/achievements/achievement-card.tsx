import Image from "next/image";
import { LockKeyhole, Trophy } from "lucide-react";

export type AchievementShowcaseItem = {
  awardedAt: Date | string | null;
  code: string;
  currentValue: number;
  description: string;
  highestAwardedLevel: number | null;
  imageUrl: string | null;
  levelCount: number;
  name: string;
  nextLevel: number | null;
  nextThreshold: number | null;
};

function formatAwardedAt(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatAwardStatus(item: AchievementShowcaseItem) {
  if (!item.awardedAt) return "Ещё не получена"
  const date = formatAwardedAt(item.awardedAt)
  if (item.levelCount <= 1) return `Получена ${date}`
  return `Уровень ${item.highestAwardedLevel} получен ${date}`
}

export function selectRecentAwardedAchievements(items: AchievementShowcaseItem[]) {
  return items
    .filter((item) => item.awardedAt !== null)
    .sort((left, right) => new Date(right.awardedAt!).getTime() - new Date(left.awardedAt!).getTime())
}

export function AchievementCard({ item }: { item: AchievementShowcaseItem }) {
  const isAwarded = item.awardedAt !== null

  return (
    <article
      className={`flex h-full min-w-0 flex-col rounded-md border p-3 ${
        isAwarded
          ? "border-amber-700/35 bg-amber-50/55"
          : "border-stone-300/80 bg-stone-100/45 text-stone-500"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border ${
            isAwarded
              ? "border-amber-700/35 bg-white/70 text-amber-800"
              : "border-stone-300 bg-white/50 text-stone-400"
          }`}
        >
          {item.imageUrl ? (
            <Image
              alt=""
              className={`object-cover ${isAwarded ? "" : "grayscale opacity-45"}`}
              fill
              sizes="48px"
              src={item.imageUrl}
            />
          ) : isAwarded ? <Trophy className="size-4" /> : <LockKeyhole className="size-4" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-medium text-stone-950">{item.name}</h3>
          <p className="mt-1 text-xs leading-5">{item.description}</p>
        </div>
      </div>
      <div className="mt-auto pt-2">
        <p className="font-mono text-[10px] uppercase tracking-wider">
          {formatAwardStatus(item)}
        </p>
        {item.nextThreshold !== null ? (
          <div className="mt-1.5 grid gap-1">
            <div
              className={`h-1.5 overflow-hidden rounded-full ${
                isAwarded ? "bg-amber-800/15" : "bg-stone-300/80"
              }`}
              role="progressbar"
              aria-label="Прогресс до следующего уровня"
              aria-valuemin={0}
              aria-valuemax={item.nextThreshold}
              aria-valuenow={Math.min(item.currentValue, item.nextThreshold)}
            >
              <div
                className={`h-full rounded-full ${
                  isAwarded ? "bg-amber-700" : "bg-stone-500"
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, (item.currentValue / item.nextThreshold) * 100))}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-stone-600">
              {item.currentValue} из {item.nextThreshold}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  )
}
