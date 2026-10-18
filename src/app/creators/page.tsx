import Link from "next/link";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { PaginationNav } from "@/components/pagination-nav";
import { getPublicCreatorsPage, getPublicCreatorMediaTypeTabs } from "@/db/queries/creators";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { CreatorSearch } from "./creators-search";
import { CreatorCatalog } from "./creators-catalog";

export const metadata = { title: "Создатели" };

export const dynamic = "force-dynamic";

const CREATORS_PAGE_SIZE_OPTIONS = [24, 48, 72] as const;
const DEFAULT_CREATORS_PAGE_SIZE = 24;


type CreatorPageProps = {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
    letter?: string;
    type?: string;
  }>;
};

export default async function CreatorPage({ searchParams }: CreatorPageProps) {
  const [params, headerState] = await Promise.all([
    searchParams,
    getPublicSiteHeaderState(),
  ]);
  const searchQuery = params.q?.trim() ?? "";
  const pageSize = parsePageSize(
    params.pageSize,
    CREATORS_PAGE_SIZE_OPTIONS,
    DEFAULT_CREATORS_PAGE_SIZE,
  );
  const mediaTypes = await getPublicCreatorMediaTypeTabs();
  const selectedMediaType = mediaTypes.find(type => type.code === params.type)?.code ?? mediaTypes[0]?.code;
  const creatorsPage = await getPublicCreatorsPage({
    letter: params.letter,
    mediaType: selectedMediaType,
    page: parsePage(params.page),
    pageSize,
    searchQuery,
  });
  const paginationSearchParams = {
    pageSize: pageSize !== DEFAULT_CREATORS_PAGE_SIZE ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    letter: creatorsPage.selectedLetter,
    type: selectedMediaType,
  };
  const getLetterHref = (letter?: string) => {
    const nextParams = new URLSearchParams();

    if (pageSize !== DEFAULT_CREATORS_PAGE_SIZE) nextParams.set("pageSize", String(pageSize));
    if (selectedMediaType) nextParams.set("type", selectedMediaType);
    if (letter) nextParams.set("letter", letter);

    const queryString = nextParams.toString();
    return queryString ? `/creators?${queryString}` : "/creators";
  };

  const getMediaTypeHref = (mediaType?: string) => {
    const nextParams = new URLSearchParams();
    if (mediaType) nextParams.set("type", mediaType);
    if (searchQuery) nextParams.set("q", searchQuery);
    if (pageSize !== DEFAULT_CREATORS_PAGE_SIZE) nextParams.set("pageSize", String(pageSize));
    return nextParams.size ? `/creators?${nextParams}` : "/creators";
  };

  return (
    <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <div className="flex w-full flex-1">
        <div className="archive-paper archive-panel flex w-full flex-col overflow-hidden">
        <header className="p-5 pb-3 sm:p-6 sm:pb-4">
          <h1 className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
            Создатели
          </h1>
          <nav aria-label="Типы медиа создателей" className="mt-4 flex flex-wrap gap-2">
            {mediaTypes.map(mediaType => {
              return (
              <Link key={mediaType.code} href={getMediaTypeHref(mediaType.code)}
                aria-current={selectedMediaType === mediaType.code ? "page" : undefined}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${selectedMediaType === mediaType.code ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"}`}>
                {mediaType.name}
                <span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums" aria-label={`Создателей: ${mediaType.creatorsCount}`}>{mediaType.creatorsCount}</span>
              </Link>
              );
            })}
          </nav>
          <CreatorSearch searchQuery={searchQuery} />
          {!searchQuery && creatorsPage.availableLetters.length > 0 ? (
            <nav aria-label="Алфавит создателей" className="mt-4 flex flex-wrap gap-1.5">
              <Link
                aria-current={!creatorsPage.selectedLetter ? "page" : undefined}
                className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${!creatorsPage.selectedLetter ? "border-stone-950 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"}`}
                href={getLetterHref()}
              >
                Все
              </Link>
              {creatorsPage.availableLetters.map((letter) => (
                <Link
                  aria-current={creatorsPage.selectedLetter === letter ? "page" : undefined}
                  className={`min-w-9 rounded border px-2.5 py-1.5 text-center font-mono text-xs transition-colors ${creatorsPage.selectedLetter === letter ? "border-stone-950 bg-stone-900 text-stone-50" : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"}`}
                  href={getLetterHref(letter)}
                  key={letter}
                >
                  {letter}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        {creatorsPage.items.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300/60 p-6 text-sm text-stone-600">
            <span>
              {searchQuery ? "По вашему запросу создатели не найдены." : selectedMediaType ? "В этом типе медиа пока нет создателей с опубликованными записями." : "Пока в архиве нет создателей."}
            </span>
            {searchQuery ? (
              <Link
                className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 underline decoration-stone-400 underline-offset-4 hover:text-stone-950"
                href={selectedMediaType ? `/creators?type=${encodeURIComponent(selectedMediaType)}` : "/creators"}
              >
                Сбросить поиск
              </Link>
            ) : null}
          </div>
        ) : (
          <CreatorCatalog
            items={creatorsPage.items}
            mediaType={selectedMediaType}
            selectedLetter={creatorsPage.selectedLetter}
          />
        )}
          <div className="mt-auto border-t border-stone-400/45 bg-amber-50/20 px-3 py-3 [&>nav]:border-0 [&>nav]:bg-transparent [&>nav]:p-0 [&>nav]:shadow-none sm:px-4">
            <PaginationNav
              basePath="/creators"
              itemLabel="создателей"
              page={creatorsPage.page}
              pageSize={creatorsPage.pageSize}
              pageSizeOptions={CREATORS_PAGE_SIZE_OPTIONS}
              searchParams={paginationSearchParams}
              showPageJump
              totalCount={creatorsPage.paginationTotalCount}
              totalPages={creatorsPage.totalPages}
              variant="archive"
            />
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
