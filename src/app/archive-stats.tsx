import type { getArchiveStats } from "@/db/queries/media-items";

type ArchiveStatsProps = {
  stats: Awaited<ReturnType<typeof getArchiveStats>>;
};

export function ArchiveStats({ stats }: ArchiveStatsProps) {
  const summaryItems = [
    {
      label: "Франшизы",
      value: stats.franchisesCount,
    },
    {
      label: "Оценки",
      value: stats.ratingsCount,
    },
    {
      label: "Оценили",
      value: stats.ratingAuthorsCount,
    },
  ];

  return (
    <section className="border border-zinc-300 bg-zinc-200">
      <div className="grid grid-cols-3 gap-px">
        {summaryItems.map((item) => (
          <div key={item.label} className="bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              {item.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
