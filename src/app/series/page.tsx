import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import {
  getPublishedFranchisesPage,
  type FranchiseTreeNode,
} from "@/db/queries/franchises";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { SeriesSearch } from "./series-search";

export const dynamic = "force-dynamic";

const SERIES_PAGE_SIZE_OPTIONS = [24, 48, 72] as const;
const DEFAULT_SERIES_PAGE_SIZE = 24;

type SeriesPageProps = {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
  }>;
};

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

function SeriesTree({ nodes, depth = 0 }: { nodes: FranchiseTreeNode[]; depth?: number }) {
  return nodes.map((series) => (
    <div key={series.id} className={depth > 0 ? "border-l border-stone-300/80" : ""}>
      <Link
        className="group flex items-center justify-between gap-5 px-4 py-2.5 transition-colors hover:bg-stone-50/70 sm:px-5"
        href={`/series/${series.code}`}
        style={depth > 0 ? { paddingLeft: `${1 + depth * 1.25}rem` } : undefined}
      >
        <div className="min-w-0">
          <h2 className="break-words font-serif text-lg leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4">
            {series.title}
          </h2>
          {series.originalTitle && series.originalTitle !== series.title ? (
            <p className="mt-0.5 break-words font-mono text-[0.65rem] uppercase tracking-[0.08em] text-stone-500">
              {series.originalTitle}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-stone-600">
          {formatMediaItemsCount(series.mediaItemsCount)}
        </p>
      </Link>
      {series.children.length > 0 ? (
        <SeriesTree nodes={series.children} depth={depth + 1} />
      ) : null}
    </div>
  ));
}

export default async function SeriesPage({ searchParams }: SeriesPageProps) {
  const [params, currentAuthor] = await Promise.all([searchParams, getCurrentAuthor()]);
  const searchQuery = params.q?.trim() ?? "";
  const pageSize = parsePageSize(
    params.pageSize,
    SERIES_PAGE_SIZE_OPTIONS,
    DEFAULT_SERIES_PAGE_SIZE,
  );
  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(currentAuthor?.id);
  const seriesPage = await getPublishedFranchisesPage({
    enabledMediaTypeCodes,
    page: parsePage(params.page),
    pageSize,
    searchQuery,
  });
  const paginationSearchParams = {
    pageSize: pageSize !== DEFAULT_SERIES_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
  };

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <header className="archive-paper archive-panel archive-stack archive-stack-left p-5 sm:p-6">
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
          <h1 className="mt-3 font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
            Все серии
          </h1>
          <SeriesSearch searchQuery={searchQuery} />
        </header>

        {seriesPage.items.length === 0 ? (
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
            <SeriesTree nodes={seriesPage.items} />
          </section>
        )}

        <PaginationNav
          basePath="/series"
          itemLabel="серий"
          page={seriesPage.page}
          pageSize={seriesPage.pageSize}
          pageSizeOptions={SERIES_PAGE_SIZE_OPTIONS}
          searchParams={paginationSearchParams}
          showPageJump
          totalCount={seriesPage.paginationTotalCount}
          totalPages={seriesPage.totalPages}
          variant="archive"
        />
      </div>
    </main>
  );
}
