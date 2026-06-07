"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input, Select } from "@/components/ui/form";
import {
  isAuthorOnlyCatalogSort,
  type CatalogSort,
  type MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";

type AdminMediaFiltersFormProps = {
  availableMediaTypes: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  authorFilter: number | null;
  authors: Array<{
    id: number;
    name: string;
  }>;
  mediaCarrierFilter: number | null;
  mediaCarriers: Array<{
    id: number;
    mediaType: MediaType;
    name: string;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypes: MediaTypeOption[];
  searchQuery: string;
  sort: CatalogSort;
  totalCount: number;
};

const SORT_LABELS: Record<CatalogSort, string> = {
  title: "По названию",
  release_year: "По году",
  average_score: "По средней оценке",
  ratings_count: "По количеству оценок",
  my_rating_order: "По порядку оценки",
  my_first_experience_year: "По году знакомства",
};

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

export function AdminMediaFiltersForm({
  availableMediaTypes,
  authorFilter,
  authors,
  mediaCarrierFilter,
  mediaCarriers,
  mediaTypeFilter,
  mediaTypes,
  searchQuery,
  sort,
  totalCount,
}: AdminMediaFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const isResettingFilters = useRef(false);
  const previousSearchQuery = useRef(searchQuery);

  const replaceFilters = useCallback(
    (nextFilters: {
      author?: number | null;
      carrier?: number | null;
      q?: string;
      sort?: CatalogSort;
      type?: MediaTypeFilter;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("updated");
      nextSearchParams.delete("deleted");
      nextSearchParams.delete("error");
      nextSearchParams.delete("page");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
      }

      if (nextFilters.author !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "author",
          nextFilters.author ? String(nextFilters.author) : "",
          "",
        );
      }

      if (nextFilters.type !== undefined) {
        updateFilterParam(nextSearchParams, "type", nextFilters.type, "all");
        nextSearchParams.delete("carrier");
      }

      if (nextFilters.carrier !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "carrier",
          nextFilters.carrier ? String(nextFilters.carrier) : "",
          "",
        );
      }

      if (nextFilters.sort !== undefined) {
        updateFilterParam(nextSearchParams, "sort", nextFilters.sort, "title");
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

  function resetFilters() {
    isResettingFilters.current = true;
    previousSearchQuery.current = "";
    setSearch("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  useEffect(() => {
    if (previousSearchQuery.current !== searchQuery) {
      previousSearchQuery.current = searchQuery;
      setSearch(searchQuery);
      isResettingFilters.current = false;
      return;
    }

    if (isResettingFilters.current) {
      isResettingFilters.current = false;
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

  const availableMediaCarriers =
    mediaTypeFilter === "all"
      ? []
      : mediaCarriers.filter((carrier) => carrier.mediaType === mediaTypeFilter);

  return (
    <div className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Название или оригинал"
        aria-label="Поиск записей"
      />

      <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <Select
          value={mediaTypeFilter}
          onChange={(event) => replaceFilters({ type: event.target.value as MediaTypeFilter })}
          aria-label="Фильтр по типу медиа"
        >
          <option value="all">Все типы ({totalCount})</option>
          {availableMediaTypes.map(({ mediaType, count }) => (
            <option key={mediaType} value={mediaType}>
              {getMediaTypeLabel(mediaType, mediaTypes)} ({count})
            </option>
          ))}
        </Select>

        <Select
          value={mediaCarrierFilter ? String(mediaCarrierFilter) : ""}
          onChange={(event) =>
            replaceFilters({
              carrier: event.target.value ? Number(event.target.value) : null,
            })
          }
          disabled={mediaTypeFilter === "all" || availableMediaCarriers.length === 0}
          aria-label="Фильтр по носителю"
        >
          <option value="">
            {mediaTypeFilter === "all"
              ? "Сначала тип медиа"
              : availableMediaCarriers.length === 0
                ? "Носителей нет"
                : "Все носители"}
          </option>
          {availableMediaCarriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.name}
            </option>
          ))}
        </Select>

        <Select
          value={authorFilter ? String(authorFilter) : ""}
          onChange={(event) =>
            replaceFilters({
              author: event.target.value ? Number(event.target.value) : null,
            })
          }
          aria-label="Фильтр по автору"
        >
          <option value="">Все авторы</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </Select>

        <Select
          value={sort}
          onChange={(event) => replaceFilters({ sort: event.target.value as CatalogSort })}
          aria-label="Сортировка записей"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => {
            const optionSort = value as CatalogSort;

            return isAuthorOnlyCatalogSort(optionSort) ? null : (
              <option key={value} value={value}>
                {label}
              </option>
            );
          })}
        </Select>

        <button
          type="button"
          onClick={resetFilters}
          className="flex h-10 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-950"
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}
