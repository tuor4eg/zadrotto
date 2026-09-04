import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { getPublishedFranchisesPage } from "@/db/queries/franchises";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { SeriesSearch } from "./series-search";
import { SeriesCatalog } from "./series-catalog";

export const dynamic = "force-dynamic";

const SERIES_PAGE_SIZE_OPTIONS = [24, 48, 72] as const;
const DEFAULT_SERIES_PAGE_SIZE = 24;

type SeriesPageProps = {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
    letter?: string;
  }>;
};

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
    letter: params.letter,
    page: parsePage(params.page),
    pageSize,
    searchQuery,
  });
  const paginationSearchParams = {
    pageSize: pageSize !== DEFAULT_SERIES_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    letter: seriesPage.selectedLetter,
  };
  const getLetterHref = (letter?: string) => {
    const nextParams = new URLSearchParams();

    if (pageSize !== DEFAULT_SERIES_PAGE_SIZE) nextParams.set("pageSize", String(pageSize));
    if (letter) nextParams.set("letter", letter);

    const queryString = nextParams.toString();
    return queryString ? `/series?${queryString}` : "/series";
  };

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3">
        <div className="archive-paper archive-panel archive-stack archive-stack-left overflow-hidden">
        <header className="p-5 pb-3 sm:p-6 sm:pb-4">
          <nav
            aria-label="Хлебные крошки"
            className="font-mono text-xs uppercase tracking-[0.14em] text-stone-600"
          >
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <Link
                  className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                  href="/"
                >
                  Главная
                </Link>
              </li>
              <li aria-hidden="true" className="text-stone-400">/</li>
              <li>
                <Link
                  className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                  href="/archive"
                >
                  Архив
                </Link>
              </li>
            </ol>
          </nav>
          <h1 className="mt-3 font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
            Все серии
          </h1>
          <SeriesSearch searchQuery={searchQuery} />
          {!searchQuery && seriesPage.availableLetters.length > 0 ? (
            <nav aria-label="Алфавит серий" className="mt-4 flex flex-wrap gap-1.5">
              <Link
                aria-current={!seriesPage.selectedLetter ? "page" : undefined}
                className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${!seriesPage.selectedLetter ? "border-stone-950 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"}`}
                href={getLetterHref()}
              >
                Все
              </Link>
              {seriesPage.availableLetters.map((letter) => (
                <Link
                  aria-current={seriesPage.selectedLetter === letter ? "page" : undefined}
                  className={`min-w-9 rounded border px-2.5 py-1.5 text-center font-mono text-xs transition-colors ${seriesPage.selectedLetter === letter ? "border-stone-950 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"}`}
                  href={getLetterHref(letter)}
                  key={letter}
                >
                  {letter}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        {seriesPage.items.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300/60 p-6 text-sm text-stone-600">
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
          <SeriesCatalog
            items={seriesPage.items}
            isSearchActive={Boolean(searchQuery)}
            selectedLetter={seriesPage.selectedLetter}
          />
        )}
          <div className="border-t border-stone-400/45 bg-amber-50/20 px-3 py-3 [&>nav]:border-0 [&>nav]:bg-transparent [&>nav]:p-0 [&>nav]:shadow-none sm:px-4">
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
        </div>
      </div>
    </main>
  );
}
