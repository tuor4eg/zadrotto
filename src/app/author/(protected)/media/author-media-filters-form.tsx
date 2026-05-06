"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  type AuthorMediaStatusFilter,
  type AuthorMediaTypeFilter,
} from "@/lib/author-media-filters";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from "@/lib/publication-status";

type AuthorMediaFiltersFormProps = {
  searchQuery: string;
  mediaTypeFilter: AuthorMediaTypeFilter;
  statusFilter: AuthorMediaStatusFilter;
};

function updateFilterParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  emptyValue = "all",
) {
  if (value === emptyValue || value.trim() === "") {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

export function AuthorMediaFiltersForm({
  searchQuery,
  mediaTypeFilter,
  statusFilter,
}: AuthorMediaFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);

  const replaceFilters = useCallback(
    (nextFilters: {
      q?: string;
      type?: AuthorMediaTypeFilter;
      status?: AuthorMediaStatusFilter;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("created");
      nextSearchParams.delete("updated");
      nextSearchParams.delete("error");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q, "");
      }

      if (nextFilters.type !== undefined) {
        updateFilterParam(nextSearchParams, "type", nextFilters.type);
      }

      if (nextFilters.status !== undefined) {
        updateFilterParam(nextSearchParams, "status", nextFilters.status);
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
    <div className="grid gap-3 border border-zinc-200 bg-white p-3 lg:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="author-media-search"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Поиск
        </label>
        <input
          id="author-media-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Название, оригинал или код"
          className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="author-media-type-filter"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Тип
        </label>
        <select
          id="author-media-type-filter"
          value={mediaTypeFilter}
          onChange={(event) =>
            replaceFilters({ type: event.target.value as AuthorMediaTypeFilter })
          }
          className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
        >
          <option value="all">Все типы</option>
          {MEDIA_TYPES.map((mediaType: MediaType) => (
            <option key={mediaType} value={mediaType}>
              {MEDIA_TYPE_LABELS[mediaType]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="author-media-status-filter"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Статус
        </label>
        <select
          id="author-media-status-filter"
          value={statusFilter}
          onChange={(event) =>
            replaceFilters({ status: event.target.value as AuthorMediaStatusFilter })
          }
          className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
        >
          <option value="all">Все статусы</option>
          {PUBLICATION_STATUSES.map((status: PublicationStatus) => (
            <option key={status} value={status}>
              {PUBLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end">
        <button
          type="button"
          onClick={resetFilters}
          className="flex h-10 w-full items-center justify-center border border-zinc-300 bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}
