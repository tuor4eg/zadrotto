"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Library, Search, X } from "lucide-react";

import { ArchiveSelect } from "@/components/ui/archive-select";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type { AuthorRatingFilter, CatalogSort, MediaTypeFilter } from "./media-items-catalog-logic";
import {
  DEFAULT_CATALOG_SORT_DIRECTIONS,
  type CatalogSortDirection,
} from "./media-items-catalog-logic";

type CatalogHeaderControlsProps = {
  authorRatingFilter: AuthorRatingFilter;
  compact?: boolean;
  currentAuthor: boolean;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
};

const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  title: "Название",
  release_year: "Год выпуска",
  media_type: "Тип медиа",
  average_score: "Средняя оценка",
  ratings_count: "Количество оценок",
  my_rating_order: "Порядок моей оценки",
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

function getSortDirectionLabel(direction: CatalogSortDirection) {
  return direction === "asc" ? "по возрастанию" : "по убыванию";
}

function getOppositeSortDirection(direction: CatalogSortDirection): CatalogSortDirection {
  return direction === "asc" ? "desc" : "asc";
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
  sortDirection,
}: CatalogHeaderControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [openSelect, setOpenSelect] = useState<"author-rating" | "sort" | null>(null);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const previousSearchQuery = useRef(searchQuery);
  const sortOptions = Object.entries(CATALOG_SORT_LABELS).filter(
    ([value]) => currentAuthor || value !== "my_rating_order",
  );

  const replaceFilters = useCallback(
    (nextFilters: {
      mine?: AuthorRatingFilter;
      q?: string;
      sort?: CatalogSort;
      sortDirection?: CatalogSortDirection;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      const nextSort = nextFilters.sort ?? sort;
      const nextSortDirection =
        nextFilters.sortDirection ??
        (nextFilters.sort && nextFilters.sort !== sort
          ? DEFAULT_CATALOG_SORT_DIRECTIONS[nextFilters.sort]
          : sortDirection);

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

      if (nextFilters.sort !== undefined || nextFilters.sortDirection !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "dir",
          nextSortDirection,
          DEFAULT_CATALOG_SORT_DIRECTIONS[nextSort],
        );
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
    [mediaTypeFilter, pathname, router, searchParams, sort, sortDirection],
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
        <ArchiveTooltip
          label={openSelect === "author-rating" ? "" : getAuthorRatingFilterTooltip(authorRatingFilter)}
          side="bottom"
        >
          <ArchiveSelect
            ariaLabel={getAuthorRatingFilterTooltip(authorRatingFilter)}
            compact
            onOpenChange={(isOpen) => setOpenSelect(isOpen ? "author-rating" : null)}
            options={Object.entries(AUTHOR_RATING_FILTER_LABELS).map(([value, label]) => ({
              value: value as AuthorRatingFilter,
              label,
              icon: AUTHOR_RATING_FILTER_ICONS[value as AuthorRatingFilter],
            }))}
            value={authorRatingFilter}
            onChange={(nextFilter) => replaceFilters({ mine: nextFilter })}
          />
        </ArchiveTooltip>
      ) : null}

      <ArchiveTooltip
        label={
          openSelect === "sort"
            ? ""
            : `${getSortTooltip(sort)}, ${getSortDirectionLabel(sortDirection)}`
        }
        side="bottom"
      >
        <ArchiveSelect
          ariaLabel={`${getSortTooltip(sort)}, ${getSortDirectionLabel(sortDirection)}`}
          compact
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? "sort" : null)}
          options={sortOptions.map(([value, label]) => {
            const optionSort = value as CatalogSort;
            const direction =
              optionSort === sort
                ? sortDirection
                : DEFAULT_CATALOG_SORT_DIRECTIONS[optionSort];

            return {
              value: optionSort,
              label,
              icon:
                direction === "asc" ? (
                  <ArrowUp aria-label="По возрастанию" className="size-4" />
                ) : (
                  <ArrowDown aria-label="По убыванию" className="size-4" />
                ),
            };
          })}
          value={sort}
          onChange={(nextSort) => replaceFilters({ sort: nextSort })}
          onIconClick={(nextSort) => {
            const currentDirection =
              nextSort === sort ? sortDirection : DEFAULT_CATALOG_SORT_DIRECTIONS[nextSort];

            replaceFilters({
              sort: nextSort,
              sortDirection: getOppositeSortDirection(currentDirection),
            });
          }}
        />
      </ArchiveTooltip>
    </div>
  );
}
