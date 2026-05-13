"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  FolderOpen,
  Library,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  type AuthorRatingFilter,
  type CatalogSort,
  type MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { ArchiveNote } from "@/app/archive-note";
import {
  MediaItemRatingModal,
  MediaItemRatingPanel,
  RatingStars,
} from "@/app/media-item-rating-dialog";
import { MediaTypeTabs } from "@/app/media-type-tabs";
import { PaginationNav } from "@/components/pagination-nav";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";

type MediaItemsCatalogProps = {
  authorRatingFilter: AuthorRatingFilter;
  items: CatalogMediaItem[];
  mediaTypeCounts: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: CatalogSort;
  totalCount: number;
  totalPages: number;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
};

const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  title: "Название",
  release_year: "Год выпуска",
  media_type: "Тип медиа",
  average_score: "Средняя оценка",
  ratings_count: "Количество оценок",
};

const AUTHOR_RATING_FILTER_LABELS: Record<AuthorRatingFilter, string> = {
  all: "Все",
  rated: "Оцененные мной",
  unrated: "Без моей оценки",
};

const AUTHOR_RATING_FILTER_ICONS: Record<AuthorRatingFilter, React.ReactNode> = {
  all: <Library className="size-4" />,
  rated: <Check className="size-4" />,
  unrated: <X className="size-4" />,
};

function getSortTooltip(sort: CatalogSort) {
  return `Сортировка: ${CATALOG_SORT_LABELS[sort].toLowerCase()}`;
}

function getAuthorRatingFilterTooltip(filter: AuthorRatingFilter) {
  return `Фильтр: ${AUTHOR_RATING_FILTER_LABELS[filter].toLowerCase()}`;
}

function updateFilterParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  emptyValue: string,
) {
  if (value === emptyValue || value.trim() === "") {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

function ArchiveCover({
  className,
  item,
  mode = "cover",
}: {
  className?: string;
  item: CatalogMediaItem;
  mode?: "cover" | "contain";
}) {
  if (item.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.coverUrl}
        alt={`Обложка: ${item.title}`}
        className={className}
        style={{ objectFit: mode }}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 ${className ?? ""}`}
    >
      Без обложки
    </div>
  );
}

export function MediaItemsCatalog({
  authorRatingFilter,
  currentAuthor,
  items,
  mediaTypeCounts: mediaTypeCountRows,
  mediaTypeFilter,
  page,
  pageSize,
  searchQuery,
  sort,
  totalCount,
  totalPages,
}: MediaItemsCatalogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [search, setSearch] = useState(searchQuery);
  const [isRatingDialogOpen, setIsRatingDialogOpen] = useState(false);
  const [hasUnsavedRating, setHasUnsavedRating] = useState(false);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const availableMediaTypes = useMemo(
    () =>
      MEDIA_TYPES.filter((mediaType) =>
        mediaTypeCountRows.some((item) => item.mediaType === mediaType && item.count > 0),
      ),
    [mediaTypeCountRows],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );
  const archiveTotalCount = useMemo(
    () => mediaTypeCountRows.reduce((total, item) => total + item.count, 0),
    [mediaTypeCountRows],
  );
  const paginationSearchParams = {
    mine: currentAuthor && authorRatingFilter !== "all" ? authorRatingFilter : undefined,
    q: searchQuery || undefined,
    sort: sort !== "title" ? sort : undefined,
    type: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
  };

  const replaceFilters = useCallback(
    (nextFilters: {
      mine?: AuthorRatingFilter;
      q?: string;
      sort?: CatalogSort;
      type?: MediaTypeFilter;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("page");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
      }

      if (nextFilters.type !== undefined) {
        updateFilterParam(nextSearchParams, "type", nextFilters.type, "all");
      }

      if (nextFilters.sort !== undefined) {
        updateFilterParam(nextSearchParams, "sort", nextFilters.sort, "title");
      }

      if (nextFilters.mine !== undefined) {
        updateFilterParam(nextSearchParams, "mine", nextFilters.mine, "all");
      }

      const queryString = nextSearchParams.toString();

      if (queryString === searchParams.toString()) {
        return;
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (isFirstSearchSync.current) {
      isFirstSearchSync.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      replaceFilters({ q: search });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [replaceFilters, search]);

  function handleSortChange(sort: CatalogSort) {
    replaceFilters({ sort });
  }

  function handleAuthorRatingFilterChange(nextAuthorRatingFilter: AuthorRatingFilter) {
    replaceFilters({ mine: nextAuthorRatingFilter });
  }

  function handleMediaTypeFilterChange(nextMediaTypeFilter: MediaTypeFilter) {
    replaceFilters({ type: nextMediaTypeFilter });
  }

  if (archiveTotalCount === 0) {
    return (
      <div className="archive-paper archive-panel p-6 text-sm text-stone-600">
        Пока в архиве нет записей.
      </div>
    );
  }

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
      <div className="archive-paper archive-panel archive-stack archive-stack-right min-w-0 p-4">
        <div className="rounded-md border border-stone-300/80 bg-stone-50/35 p-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="sr-only" htmlFor="catalog-search">
              Поиск
            </label>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
              <input
                id="catalog-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 pl-10 pr-3 text-sm text-stone-950 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] outline-none placeholder:text-stone-500 focus:border-stone-700"
                placeholder="Поиск по записям"
              />
            </div>

            {currentAuthor ? (
              <div
                className="relative h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700 sm:w-11"
                title={getAuthorRatingFilterTooltip(authorRatingFilter)}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none flex h-full w-full items-center justify-center"
                >
                  {AUTHOR_RATING_FILTER_ICONS[authorRatingFilter]}
                </span>
                <label className="sr-only" htmlFor="media-catalog-author-rating-filter">
                  Фильтр моих оценок
                </label>
                <select
                  id="media-catalog-author-rating-filter"
                  value={authorRatingFilter}
                  onChange={(event) =>
                    handleAuthorRatingFilterChange(event.target.value as AuthorRatingFilter)
                  }
                  aria-label={getAuthorRatingFilterTooltip(authorRatingFilter)}
                  title={getAuthorRatingFilterTooltip(authorRatingFilter)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {Object.entries(AUTHOR_RATING_FILTER_LABELS).map(([filter, label]) => (
                    <option key={filter} value={filter}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div
              className="relative h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700 sm:w-11"
              title={getSortTooltip(sort)}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none flex h-full w-full items-center justify-center"
              >
                <SlidersHorizontal className="size-4" />
              </span>
              <label className="sr-only" htmlFor="media-catalog-sort">
                Сортировка
              </label>
              <select
                id="media-catalog-sort"
                value={sort}
                onChange={(event) => handleSortChange(event.target.value as CatalogSort)}
                aria-label={getSortTooltip(sort)}
                title={getSortTooltip(sort)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {Object.entries(CATALOG_SORT_LABELS).map(([sort, label]) => (
                  <option key={sort} value={sort}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <MediaTypeTabs
          availableMediaTypes={availableMediaTypes}
          selectedMediaType={mediaTypeFilter}
          onChange={handleMediaTypeFilterChange}
        />

        <div className="archive-scrollbar mt-2 flex max-h-[780px] flex-col gap-2 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="rounded-md border border-stone-300/80 bg-stone-50/60 p-5 text-sm text-stone-600">
              Ничего не найдено.
            </div>
          ) : null}
          {items.map((item) => {
            const isSelected = item.id === selectedItem?.id;
            const shouldShowAuthorScore =
              currentAuthor !== null && item.currentAuthorScore !== null;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(item.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`relative grid w-full grid-cols-[18px_76px_minmax(0,1fr)_auto] gap-3 rounded-md border p-2 text-left transition-colors ${
                  isSelected
                    ? "border-red-900/60 bg-red-50/25 shadow-[inset_3px_0_0_#7f1d1d]"
                    : "border-stone-300/80 bg-stone-50/55 hover:border-stone-500 hover:bg-stone-50/80"
                }`}
                aria-pressed={isSelected}
              >
                <span className="mt-8 size-3 rounded-full border border-stone-400 bg-stone-200 shadow-[inset_0_1px_2px_rgba(68,64,60,0.35)]" />
                <span className="block aspect-[4/3] overflow-hidden rounded-sm border border-stone-300 bg-stone-200">
                  <ArchiveCover item={item} className="h-full w-full" />
                </span>
                <span className="min-w-0 self-center">
                  <span className="block truncate font-serif text-xl leading-tight text-stone-950">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-stone-700">
                    {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                    {item.releaseYear ? <span>•</span> : null}
                    <span>{MEDIA_TYPE_LABELS[item.mediaType].toLowerCase()}</span>
                    {item.franchiseTitle ? <span>•</span> : null}
                    {item.franchiseTitle ? (
                      <span className="min-w-0 truncate">{item.franchiseTitle}</span>
                    ) : null}
                  </span>
                </span>
                <span
                  className={`hidden shrink-0 items-stretch gap-3 border-l border-dashed border-stone-300 pl-4 text-center sm:grid ${
                    shouldShowAuthorScore ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
                      Оценка
                    </span>
                    <span className="mt-1 block font-serif text-3xl tabular-nums text-stone-950">
                      {formatScore(item.averageScore)}
                    </span>
                  </span>
                  {shouldShowAuthorScore ? (
                    <MediaItemRatingPanel
                      mediaItemCode={item.code}
                      franchiseCode={item.franchiseCode}
                      title={item.title}
                      currentAuthor={currentAuthor}
                      currentAuthorScore={item.currentAuthorScore}
                      onOpen={() => {
                        setSelectedId(item.id);
                        setIsRatingDialogOpen(true);
                      }}
                      size="compact"
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <PaginationNav
            basePath={pathname}
            page={page}
            pageSize={pageSize}
            searchParams={paginationSearchParams}
            totalCount={totalCount}
            totalPages={totalPages}
            variant="archive"
          />
        </div>
      </div>

      <article className="archive-paper archive-panel archive-stack archive-stack-left min-w-0">
        {selectedItem ? (
          <>
            <div className="relative grid lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1fr)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/clip-transparent-trimmed.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute top-2 right-5 z-30 h-24 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:top-0 sm:right-6 sm:h-28 lg:-top-4 lg:right-8 lg:h-32"
              />
              <div className="relative border-b border-stone-300/80 bg-stone-200/30 p-6 lg:border-b-0 lg:border-r">
                <div className="font-mono text-lg uppercase tracking-[0.38em] text-stone-950">
                  Досье
                </div>
                <div className="mt-6 mx-auto max-w-[380px] rounded-md border border-stone-400 bg-stone-950 p-2 shadow-2xl shadow-stone-950/25">
                  <div className="rounded-sm border border-stone-700 bg-stone-900 p-3">
                    <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-200">
                      Archive cover
                    </div>
                    <div className="aspect-[3/4] overflow-hidden rounded-sm bg-stone-800">
                      <ArchiveCover item={selectedItem} mode="cover" className="h-full w-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-[520px] flex-col justify-between gap-8 p-6 sm:p-8">
                <div>
                  <div className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
                    {selectedItem.title}
                  </div>
                  {selectedItem.originalTitle &&
                  selectedItem.originalTitle !== selectedItem.title ? (
                    <div className="mt-3 font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
                      {selectedItem.originalTitle}
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm text-stone-800">
                    <span>{MEDIA_TYPE_LABELS[selectedItem.mediaType].toLowerCase()}</span>
                    {selectedItem.releaseYear ? <span>•</span> : null}
                    {selectedItem.releaseYear ? <span>{selectedItem.releaseYear}</span> : null}
                    <span>•</span>
                    <span>{formatRatingsCount(selectedItem.ratingsCount)}</span>
                  </div>

                  <dl className="mt-8 grid gap-5 border-t border-dashed border-stone-300 pt-5 text-sm leading-6 text-stone-800">
                    <div>
                      <dt className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Серия
                      </dt>
                      <dd className="mt-1">
                        {selectedItem.franchiseTitle && selectedItem.franchiseCode ? (
                          <Link
                            href={`/franchises/${selectedItem.franchiseCode}`}
                            className="font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
                          >
                            {selectedItem.franchiseTitle}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-4 text-center">
                      <div className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                        Оценка архива
                      </div>
                      <div className="mt-2 font-serif text-5xl tabular-nums text-stone-950">
                        {formatScore(selectedItem.averageScore)}
                      </div>
                      <div className="mt-2 flex justify-center">
                        <RatingStars score={selectedItem.averageScore} />
                      </div>
                    </div>
                    <MediaItemRatingPanel
                      mediaItemCode={selectedItem.code}
                      franchiseCode={selectedItem.franchiseCode}
                      title={selectedItem.title}
                      currentAuthor={currentAuthor}
                      currentAuthorScore={selectedItem.currentAuthorScore}
                      onOpen={() => setIsRatingDialogOpen(true)}
                    />
                  </div>
                </div>

                <Link
                  href={`/media/${selectedItem.code}`}
                  className="inline-flex w-fit items-center gap-3 rounded-md border border-stone-400 bg-stone-50/60 px-5 py-3 font-mono text-sm text-stone-950 transition-colors hover:border-stone-950 hover:bg-stone-100"
                >
                  <FolderOpen className="size-5" />
                  Открыть досье
                  <ArrowRight className="size-5" />
                </Link>
              </div>
            </div>

            {selectedItem.description ? (
              <div className="border-t border-stone-300/80 p-6 sm:p-8">
                <ArchiveNote text={selectedItem.description} maxWidthClassName="max-w-[420px]" />
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid min-h-[420px] place-items-center p-6 text-sm text-stone-600">
            Ничего не найдено.
          </div>
        )}
      </article>

      {isRatingDialogOpen && selectedItem ? (
        <MediaItemRatingModal
          mediaItemCode={selectedItem.code}
          franchiseCode={selectedItem.franchiseCode}
          title={selectedItem.title}
          currentAuthor={currentAuthor}
          currentAuthorScore={selectedItem.currentAuthorScore}
          formId="rating-form"
          hasUnsavedRating={hasUnsavedRating}
          onClose={() => setIsRatingDialogOpen(false)}
          onScoreChange={setHasUnsavedRating}
        />
      ) : null}
    </section>
  );
}
