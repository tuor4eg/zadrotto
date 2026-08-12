import Image from "next/image";
import { LockKeyhole, Trophy } from "lucide-react";

export type AchievementShowcaseItem = {
  awardedAt: Date | string | null;
  code: string;
  description: string;
  imageUrl: string | null;
  name: string;
};

function formatAwardedAt(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export function AchievementShowcase({ items }: { items: AchievementShowcaseItem[] }) {
  return (
    <section className="archive-paper archive-panel p-4 sm:p-5" aria-labelledby="achievements-title">
      <div className="mb-4 flex items-center gap-2 border-b border-stone-400/25 pb-3">
        <Trophy className="size-5 text-amber-700" aria-hidden="true" />
        <h2 id="achievements-title" className="font-serif text-xl leading-none sm:text-2xl">
          Ачивки
        </h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => {
          const isAwarded = item.awardedAt !== null;

          return (
            <article
              key={item.code}
              className={`rounded-md border p-3 ${
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
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider">
                {item.awardedAt
                  ? `Получена ${formatAwardedAt(item.awardedAt)}`
                  : "Ещё не получена"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
