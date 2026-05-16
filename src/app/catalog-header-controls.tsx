"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Library, Search, SlidersHorizontal, X } from "lucide-react";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type { AuthorRatingFilter, CatalogSort, MediaTypeFilter } from "./media-items-catalog-logic";

type CatalogHeaderControlsProps = {
  authorRatingFilter: AuthorRatingFilter;
  compact?: boolean;
  currentAuthor: boolean;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  sort: CatalogSort;
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

export function CatalogHeaderControls({
  authorRatingFilter,
  compact = false,
  currentAuthor,
  mediaTypeFilter,
  searchQuery,
  sort,
}: CatalogHeaderControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const previousSearchQuery = useRef(searchQuery);

  const replaceFilters = useCallback(
    (nextFilters: { mine?: AuthorRatingFilter; q?: string; sort?: CatalogSort }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("page");

      if (mediaTypeFilter !== "all") {
        nextSearchParams.set("type", mediaTypeFilter);
      }

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
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
    [mediaTypeFilter, pathname, router, searchParams],
  );

  useEffect(() => {
    if (previousSearchQuery.current !== searchQuery) {
      previousSearchQuery.current = searchQuery;
      setSearch(searchQuery);
      return;
    }

    if (isFirstSearchSync.current) {
      isFirstSearchSync.current = false;
      return;
    }

    if (search === searchQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      replaceFilters({ q: search });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [replaceFilters, search, searchQuery]);

  return (
    <div
      className={`contents ${
        compact
          ? "lg:flex lg:min-w-0 lg:flex-1 lg:flex-nowrap lg:items-center lg:gap-2"
          : "lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:gap-2"
      }`}
    >
      <label className="sr-only" htmlFor="header-catalog-search">
        Поиск
      </label>
      <div
        className={`relative ${
          compact
            ? "min-w-0 flex-1 basis-auto"
            : "w-full basis-full lg:w-[210px] lg:basis-auto"
        }`}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
        <input
          id="header-catalog-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="archive-search-input h-9 w-full appearance-none rounded-md border border-stone-300/80 bg-stone-50/80 pl-9 pr-9 text-sm text-stone-950 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] outline-none placeholder:text-stone-500 focus:border-stone-700"
          placeholder="Поиск"
        />
        {search ? (
          <ArchiveTooltip
            className="absolute right-2 top-1/2 -translate-y-1/2"
            label="Сбросить поиск"
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setSearch("")}
              className="grid size-5 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-950"
              aria-label="Сбросить поиск"
            >
              <X className="size-3.5" />
            </button>
          </ArchiveTooltip>
        ) : null}
      </div>

      {currentAuthor ? (
        <ArchiveTooltip label={getAuthorRatingFilterTooltip(authorRatingFilter)} side="bottom">
          <div
            className="relative h-9 w-9 rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700"
          >
            <span aria-hidden="true" className="pointer-events-none flex h-full w-full items-center justify-center">
              {AUTHOR_RATING_FILTER_ICONS[authorRatingFilter]}
            </span>
            <label className="sr-only" htmlFor="header-author-rating-filter">
              Фильтр моих оценок
            </label>
            <select
              id="header-author-rating-filter"
              value={authorRatingFilter}
              onChange={(event) => replaceFilters({ mine: event.target.value as AuthorRatingFilter })}
              aria-label={getAuthorRatingFilterTooltip(authorRatingFilter)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {Object.entries(AUTHOR_RATING_FILTER_LABELS).map(([filter, label]) => (
                <option key={filter} value={filter}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </ArchiveTooltip>
      ) : null}

      <ArchiveTooltip label={getSortTooltip(sort)} side="bottom">
        <div
          className="relative h-9 w-9 rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700"
        >
          <span aria-hidden="true" className="pointer-events-none flex h-full w-full items-center justify-center">
            <SlidersHorizontal className="size-4" />
          </span>
          <label className="sr-only" htmlFor="header-catalog-sort">
            Сортировка
          </label>
          <select
            id="header-catalog-sort"
            value={sort}
            onChange={(event) => replaceFilters({ sort: event.target.value as CatalogSort })}
            aria-label={getSortTooltip(sort)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {Object.entries(CATALOG_SORT_LABELS).map(([sort, label]) => (
              <option key={sort} value={sort}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </ArchiveTooltip>
    </div>
  );
}
