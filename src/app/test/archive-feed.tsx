import Link from "next/link";
import { Clock3, FileText, Layers3, Library, MessageSquareQuote, type LucideIcon } from "lucide-react";

import type { ArchiveFeedItem } from "@/db/queries/archive-feed";

const KIND_DETAILS: Record<ArchiveFeedItem["kind"], { icon: LucideIcon; label: string }> = {
  collection: { icon: Library, label: "Подборка" },
  media: { icon: FileText, label: "Запись" },
  review: { icon: MessageSquareQuote, label: "Рецензия" },
  series: { icon: Layers3, label: "Серия" },
};

function formatFeedDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function ArchiveFeed({ items }: { items: ArchiveFeedItem[] }) {
  return (
    <section className="archive-paper archive-panel p-4 sm:p-5" aria-labelledby="test-archive-feed-title">
      <div className="flex items-center gap-2">
        <Clock3 aria-hidden="true" className="size-5 text-red-950/70" />
        <h2 id="test-archive-feed-title" className="font-serif text-2xl leading-none text-stone-950">
          Новое в архиве
        </h2>
      </div>

      {items.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {items.slice(0, 5).map((item, index) => {
            const { icon: KindIcon, label } = KIND_DETAILS[item.kind];
            const visibilityClassName = index >= 3
              ? "hidden xl:flex"
              : index >= 2
                ? "hidden lg:flex"
                : index >= 1
                  ? "hidden sm:flex"
                  : "flex";

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`${visibilityClassName} group min-w-0 items-stretch gap-3 transition-transform hover:-translate-y-0.5`}
              >
                <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-stone-800/10 sm:w-24">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="grid size-full place-items-center text-stone-500">
                      <KindIcon className="size-8" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col py-1">
                  <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">
                    <KindIcon className="size-3" aria-hidden="true" />
                    <span>{label}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.createdAt.toISOString()}>{formatFeedDate(item.createdAt)}</time>
                  </div>
                  <h3 className="mt-2 line-clamp-3 font-serif text-lg leading-tight text-stone-950">{item.title}</h3>
                  <p className="mt-auto line-clamp-2 pt-2 text-xs leading-5 text-stone-600">{item.meta}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="py-12 text-center font-mono text-xs uppercase tracking-wider text-stone-500">
          В архиве пока ничего нового.
        </p>
      )}
    </section>
  );
}
