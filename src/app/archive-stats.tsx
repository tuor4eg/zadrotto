import type { getArchiveStats } from "@/db/queries/media-items";

type ArchiveStatsProps = {
  stats: Awaited<ReturnType<typeof getArchiveStats>>;
};

export function ArchiveStats({ stats }: ArchiveStatsProps) {
  const summaryItems = [
    {
      label: "Серии",
      value: stats.franchisesCount,
    },
    {
      label: "Оценки",
      value: stats.ratingsCount,
    },
    {
      label: "Авторы",
      value: stats.ratingAuthorsCount,
    },
  ];

  return (
    <section className="archive-paper archive-panel overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-stone-300/70">
        {summaryItems.map((item) => (
          <div key={item.label} className="px-4 py-3 sm:px-5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {item.label}
            </div>
            <div className="mt-1 font-serif text-3xl tabular-nums text-stone-950">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
