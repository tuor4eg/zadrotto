import Link from "next/link";

import { getPublishedFranchiseTree, type FranchiseTreeNode } from "@/db/queries/franchises";
import { SeriesSearch } from "./series-search";

export const dynamic = "force-dynamic";

type SeriesPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function SeriesTree({ nodes, depth = 0 }: { nodes: FranchiseTreeNode[]; depth?: number }) {
  return nodes.map((series) => (
    <div key={series.id} className={depth > 0 ? "border-l border-stone-300/80" : ""}>
      <Link
        className="group flex items-center justify-between gap-5 px-5 py-4 transition-colors hover:bg-stone-50/70 sm:px-6"
        href={`/series/${series.code}`}
        style={depth > 0 ? { paddingLeft: `${1.25 + depth * 1.25}rem` } : undefined}
      >
        <div className="min-w-0">
          <h2 className="break-words font-serif text-xl leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4">
            {series.title}
          </h2>
          {series.originalTitle && series.originalTitle !== series.title ? (
            <p className="mt-1 break-words font-mono text-[0.7rem] uppercase tracking-[0.1em] text-stone-500">{series.originalTitle}</p>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-xs uppercase tracking-[0.12em] text-stone-600">{formatMediaItemsCount(series.mediaItemsCount)}</p>
      </Link>
      {series.children.length > 0 ? <SeriesTree nodes={series.children} depth={depth + 1} /> : null}
    </div>
  ));
}

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

export default async function SeriesPage({ searchParams }: SeriesPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() ?? "";
  const series = await getPublishedFranchiseTree(searchQuery);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <header className="archive-paper archive-panel archive-stack archive-stack-left p-6 sm:p-8">
          <nav
            aria-label="Хлебные крошки"
            className="font-mono text-xs uppercase tracking-[0.14em] text-stone-600"
          >
            <Link
              className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
              href="/"
            >
              Главная
            </Link>
          </nav>
          <h1 className="mt-4 font-serif text-5xl leading-none text-stone-950 sm:text-6xl">
            Все серии
          </h1>
          <SeriesSearch searchQuery={searchQuery} />
        </header>

        {series.length === 0 ? (
          <div className="archive-paper archive-panel flex flex-wrap items-center justify-between gap-3 p-6 text-sm text-stone-600">
            <span>
              {searchQuery ? "По вашему запросу серии не найдены." : "Пока в архиве нет серий."}
            </span>
            {searchQuery ? (
              <Link
                className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                href="/series"
              >
                Сбросить поиск
              </Link>
            ) : null}
          </div>
        ) : (
          <section aria-label="Серии" className="archive-paper archive-panel divide-y divide-stone-300/80">
            <SeriesTree nodes={series} />
          </section>
        )}
      </div>
    </main>
  );
}
