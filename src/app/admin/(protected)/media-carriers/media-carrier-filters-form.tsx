"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { type MediaTypeFilter } from "@/app/media-items-catalog-logic";
import { Input, Select } from "@/components/ui/form";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/media-types";

type MediaCarrierFiltersFormProps = {
  availableMediaTypes: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  totalCount: number;
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

export function MediaCarrierFiltersForm({
  availableMediaTypes,
  mediaTypeFilter,
  searchQuery,
  totalCount,
}: MediaCarrierFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const isResettingFilters = useRef(false);
  const previousSearchQuery = useRef(searchQuery);

  const replaceFilters = useCallback(
    (nextFilters: { q?: string; type?: MediaTypeFilter }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("created");
      nextSearchParams.delete("deleted");
      nextSearchParams.delete("error");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
      }

      if (nextFilters.type !== undefined) {
        updateFilterParam(nextSearchParams, "type", nextFilters.type, "all");
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

  return (
    <div className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_auto]">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Название или код"
          aria-label="Поиск носителей"
        />

        <Select
          value={mediaTypeFilter}
          onChange={(event) => replaceFilters({ type: event.target.value as MediaTypeFilter })}
          aria-label="Фильтр по типу медиа"
        >
          <option value="all">Все типы ({totalCount})</option>
          {availableMediaTypes.map(({ mediaType, count }) => (
            <option key={mediaType} value={mediaType}>
              {MEDIA_TYPE_LABELS[mediaType]} ({count})
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
