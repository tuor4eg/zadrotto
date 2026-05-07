"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input, Select } from "@/components/ui/form";
import type { CatalogSort, MediaTypeFilter } from "@/app/media-items-catalog-logic";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/media-types";

type AdminMediaFiltersFormProps = {
  availableMediaTypes: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  sort: CatalogSort;
  totalCount: number;
};

const SORT_LABELS: Record<CatalogSort, string> = {
  title: "По названию",
  release_year: "По году",
  media_type: "По типу",
  average_score: "По средней оценке",
  ratings_count: "По количеству оценок",
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
  mediaTypeFilter,
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

  const replaceFilters = useCallback(
    (nextFilters: {
      q?: string;
      sort?: CatalogSort;
      type?: MediaTypeFilter;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("updated");
      nextSearchParams.delete("deleted");
      nextSearchParams.delete("error");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
      }

      if (nextFilters.type !== undefined) {
        updateFilterParam(nextSearchParams, "type", nextFilters.type, "all");
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
    setSearch("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

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

  return (
    <div className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => replaceFilters({ type: "all" })}
          className={`shrink-0 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
            mediaTypeFilter === "all"
              ? "border-stone-950 bg-stone-950 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-950"
          }`}
        >
          Все
          <span
            className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
              mediaTypeFilter === "all"
                ? "bg-white text-stone-950"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            {totalCount}
          </span>
        </button>

        {availableMediaTypes.map(({ mediaType, count }) => {
          const isSelected = mediaTypeFilter === mediaType;

          return (
            <button
              key={mediaType}
              type="button"
              onClick={() => replaceFilters({ type: mediaType })}
              className={`shrink-0 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-950"
              }`}
            >
              {MEDIA_TYPE_LABELS[mediaType]}
              <span
                className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  isSelected ? "bg-white text-stone-950" : "bg-stone-100 text-stone-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_auto]">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Название, оригинал или код"
          aria-label="Поиск записей"
        />

        <Select
          value={sort}
          onChange={(event) => replaceFilters({ sort: event.target.value as CatalogSort })}
          aria-label="Сортировка записей"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
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
