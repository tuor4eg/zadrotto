"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { type MediaTypeFilter } from "@/app/media-items-catalog-logic";
import { Input, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";

type MediaCarrierFiltersFormProps = {
  availableMediaTypes: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypes: MediaTypeOption[];
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
  mediaTypes,
  searchQuery,
  totalCount,
}: MediaCarrierFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const desiredMediaTypeFilter = useRef(mediaTypeFilter);
  const hasUnconfirmedMediaTypeFilter = useRef(false);
  const previousMediaTypeFilter = useRef(mediaTypeFilter);

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
  const {
    draft: search,
    resetDraft: resetSearch,
    setDraft: setSearch,
  } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (query) =>
      replaceFilters({ q: query, type: desiredMediaTypeFilter.current }),
  });
  const dispatchDesiredFilters = useEffectEvent(() => {
    replaceFilters({ q: search, type: desiredMediaTypeFilter.current });
  });

  useEffect(() => {
    if (previousMediaTypeFilter.current === mediaTypeFilter) {
      return;
    }

    previousMediaTypeFilter.current = mediaTypeFilter;

    if (mediaTypeFilter === desiredMediaTypeFilter.current) {
      hasUnconfirmedMediaTypeFilter.current = false;
      return;
    }

    if (hasUnconfirmedMediaTypeFilter.current) {
      dispatchDesiredFilters();
      return;
    }

    desiredMediaTypeFilter.current = mediaTypeFilter;
  }, [mediaTypeFilter]);

  function resetFilters() {
    desiredMediaTypeFilter.current = "all";
    hasUnconfirmedMediaTypeFilter.current = mediaTypeFilter !== "all";
    resetSearch();
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

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
          onChange={(event) => {
            const nextMediaTypeFilter = event.target.value as MediaTypeFilter;

            desiredMediaTypeFilter.current = nextMediaTypeFilter;
            hasUnconfirmedMediaTypeFilter.current = nextMediaTypeFilter !== mediaTypeFilter;
            replaceFilters({ q: search, type: nextMediaTypeFilter });
          }}
          aria-label="Фильтр по типу медиа"
        >
          <option value="all">Все типы ({totalCount})</option>
          {availableMediaTypes.map(({ mediaType, count }) => (
            <option key={mediaType} value={mediaType}>
              {getMediaTypeLabel(mediaType, mediaTypes)} ({count})
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
