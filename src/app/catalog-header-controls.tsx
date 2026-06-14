"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarCheck,
  ChevronDown,
  Check,
  History,
  Library,
  Search,
  Star,
  X,
} from "lucide-react";

import { ArchiveSelect } from "@/components/ui/archive-select";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type {
  AuthorRatingFilter,
  CatalogSort,
  CatalogYearFilter,
  CatalogYearMode,
  MediaTypeFilter,
} from "./media-items-catalog-logic";
import {
  DEFAULT_CATALOG_SORT_DIRECTIONS,
  isAuthorOnlyCatalogSort,
  type CatalogSortDirection,
} from "./media-items-catalog-logic";

type CatalogHeaderControlsProps = {
  authorRatingFilter: AuthorRatingFilter;
  compact?: boolean;
  currentAuthor: boolean;
  mediaTypeFilter: MediaTypeFilter;
  minReleaseYear: number | null;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
};

type YearSelectValue = "all" | `${number}`;

const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  title: "Название",
  release_year: "Год выпуска",
  average_score: "Средняя оценка",
  ratings_count: "Количество оценок",
  my_rating_order: "Порядок моей оценки",
  my_first_experience_year: "Год знакомства",
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

const CATALOG_YEAR_MODE_LABELS: Record<CatalogYearMode, string> = {
  release: "Год выхода",
  experience: "Год знакомства",
  rating: "Год оценки",
};

const CATALOG_YEAR_MODE_ICONS: Record<CatalogYearMode, React.ReactNode> = {
  release: <Calendar className="size-4" />,
  experience: <History className="size-4" />,
  rating: <Star className="size-4" />,
};

const CATALOG_YEAR_MODES = ["release", "experience", "rating"] as const;

function getSortTooltip(sort: CatalogSort) {
  return `Сортировка: ${CATALOG_SORT_LABELS[sort].toLowerCase()}`;
}

function getSortDirectionLabel(direction: CatalogSortDirection) {
  return direction === "asc" ? "по возрастанию" : "по убыванию";
}

function getOppositeSortDirection(direction: CatalogSortDirection): CatalogSortDirection {
  return direction === "asc" ? "desc" : "asc";
}

function getFiltersTooltip(
  authorRatingFilter: AuthorRatingFilter,
  yearFilter: CatalogYearFilter,
  yearMode: CatalogYearMode,
  currentAuthor: boolean,
) {
  const activeParts = [];

  if (currentAuthor && authorRatingFilter !== "all") {
    activeParts.push(AUTHOR_RATING_FILTER_LABELS[authorRatingFilter].toLowerCase());
  }

  if (yearFilter !== null) {
    activeParts.push(getYearFilterTooltip(yearFilter, yearMode).toLowerCase());
  }

  return activeParts.length > 0 ? `Фильтры: ${activeParts.join(", ")}` : "Фильтры";
}

function getYearFilterTooltip(yearFilter: CatalogYearFilter, yearMode: CatalogYearMode) {
  const yearLabel = yearFilter === null ? "все годы" : String(yearFilter);

  return `${CATALOG_YEAR_MODE_LABELS[yearMode]}: ${yearLabel}`;
}

function getYearOptions(yearFilter: CatalogYearFilter, minReleaseYear: number | null) {
  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(minReleaseYear ?? currentYear, currentYear);
  const years = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  );

  if (yearFilter !== null && !years.includes(yearFilter)) {
    years.push(yearFilter);
    years.sort((left, right) => right - left);
  }

  return [
    {
      value: "all" as const,
      label: "Все годы",
      icon: <CalendarCheck className="size-4" />,
    },
    ...years.map((year) => ({
      value: String(year) as YearSelectValue,
      label: String(year),
      icon: <Calendar className="size-4" />,
    })),
  ];
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
  minReleaseYear,
  searchQuery,
  sort,
  sortDirection,
  yearFilter,
  yearMode,
}: CatalogHeaderControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [openSelect, setOpenSelect] = useState<"filters" | "sort" | null>(null);
  const [, startTransition] = useTransition();
  const filtersMenuId = useId();
  const filtersRootRef = useRef<HTMLDivElement>(null);
  const isFirstSearchSync = useRef(true);
  const previousSearchQuery = useRef(searchQuery);
  const sortOptions = Object.entries(CATALOG_SORT_LABELS).filter(
    ([value]) => currentAuthor || !isAuthorOnlyCatalogSort(value as CatalogSort),
  );
  const yearModeOptions = CATALOG_YEAR_MODES;

  const replaceFilters = useCallback(
    (nextFilters: {
      mine?: AuthorRatingFilter;
      q?: string;
      sort?: CatalogSort;
      sortDirection?: CatalogSortDirection;
      year?: CatalogYearFilter;
      yearMode?: CatalogYearMode;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      const nextSort = nextFilters.sort ?? sort;
      const nextSortDirection =
        nextFilters.sortDirection ??
        (nextFilters.sort && nextFilters.sort !== sort
          ? DEFAULT_CATALOG_SORT_DIRECTIONS[nextFilters.sort]
          : sortDirection);
      const nextYearFilter =
        nextFilters.year !== undefined ? nextFilters.year : yearFilter;
      const nextYearMode =
        nextYearFilter === null
          ? "release"
          : nextFilters.yearMode !== undefined
            ? nextFilters.yearMode
            : yearMode;

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

      if (nextFilters.year !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "year",
          nextFilters.year === null ? "" : String(nextFilters.year),
          "",
        );
      }

      if (nextFilters.year !== undefined || nextFilters.yearMode !== undefined) {
        updateFilterParam(nextSearchParams, "yearMode", nextYearMode, "release");
      }

      const queryString = nextSearchParams.toString();

      if (queryString === searchParams.toString()) {
        return;
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [mediaTypeFilter, pathname, router, searchParams, sort, sortDirection, yearFilter, yearMode],
  );

  useEffect(() => {
    if (openSelect !== "filters") {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!filtersRootRef.current?.contains(event.target as Node)) {
        setOpenSelect(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenSelect(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSelect]);

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
            : "min-w-0 flex-1 basis-auto lg:w-[210px] lg:flex-none lg:basis-auto"
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

      <ArchiveTooltip
        label={
          openSelect === "filters"
            ? ""
            : getFiltersTooltip(authorRatingFilter, yearFilter, yearMode, currentAuthor)
        }
        side="bottom"
      >
        <div ref={filtersRootRef} className="relative min-w-0">
          <button
            type="button"
            aria-label={getFiltersTooltip(authorRatingFilter, yearFilter, yearMode, currentAuthor)}
            aria-haspopup="menu"
            aria-expanded={openSelect === "filters"}
            aria-controls={filtersMenuId}
            onClick={() => setOpenSelect(openSelect === "filters" ? null : "filters")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300/80 bg-stone-50/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-colors hover:border-stone-700 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
          >
            {yearFilter === null ? <Library className="size-4" /> : <Calendar className="size-4" />}
            <ChevronDown className="sr-only" />
          </button>

          {openSelect === "filters" ? (
            <div
              id={filtersMenuId}
              role="menu"
              className="archive-paper-surface fixed inset-x-3 top-[5.25rem] z-[80] w-auto rounded-md border border-stone-500/70 p-2 shadow-[0_14px_26px_rgba(28,25,23,0.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(19rem,calc(100vw-2rem))] sm:max-w-[calc(100vw-1.5rem)]"
            >
              {currentAuthor ? (
                <div className="grid gap-1">
                  {Object.entries(AUTHOR_RATING_FILTER_LABELS).map(([value, label]) => {
                    const filter = value as AuthorRatingFilter;
                    const selected = authorRatingFilter === filter;

                    return (
                      <button
                        key={filter}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          replaceFilters({ mine: filter });
                          setOpenSelect(null);
                        }}
                        className={`flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                          selected
                            ? "bg-red-900/10 text-stone-950"
                            : "text-stone-700 hover:bg-stone-200/60 hover:text-stone-950"
                        }`}
                      >
                        <span className="grid size-4 shrink-0 place-items-center text-stone-600">
                          {AUTHOR_RATING_FILTER_ICONS[filter]}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <Check
                          className={`size-3.5 shrink-0 text-red-900 ${
                            selected ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className={currentAuthor ? "mt-2 border-t border-stone-300/70 pt-2" : ""}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <ArchiveSelect
                    ariaLabel={getYearFilterTooltip(yearFilter, yearMode)}
                    className="min-w-0 flex-1"
                    options={getYearOptions(yearFilter, minReleaseYear)}
                    triggerClassName="w-full min-w-0"
                    value={yearFilter === null ? "all" : String(yearFilter)}
                    onChange={(nextYear) =>
                      replaceFilters({ year: nextYear === "all" ? null : Number(nextYear) })
                    }
                  />
                  {currentAuthor && yearFilter !== null ? (
                    <div className="flex shrink-0 items-center gap-1 rounded-md border border-stone-300/80 bg-stone-50/60 p-0.5 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)]">
                      {yearModeOptions.map((mode) => {
                        const isSelected = yearMode === mode;
                        const label = CATALOG_YEAR_MODE_LABELS[mode];

                        return (
                          <ArchiveTooltip key={mode} label={label} side="bottom">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                replaceFilters({ yearMode: mode });
                              }}
                              className={`grid size-8 place-items-center rounded-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
                                isSelected
                                  ? "bg-red-900/12 text-red-950"
                                  : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"
                              }`}
                              aria-label={label}
                              aria-pressed={isSelected}
                            >
                              {CATALOG_YEAR_MODE_ICONS[mode]}
                            </button>
                          </ArchiveTooltip>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </ArchiveTooltip>

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
