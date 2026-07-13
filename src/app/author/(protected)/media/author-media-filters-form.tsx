"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import {
  AUTHOR_MEDIA_STATUS_FILTERS,
  type AuthorMediaStatusFilter,
  type AuthorMediaTypeFilter,
} from "@/lib/authors/media-filters";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";
import {
  PUBLICATION_STATUS_LABELS,
  type PublicationStatus,
} from "@/lib/media/publication-status";

type AuthorMediaFiltersFormProps = {
  searchQuery: string;
  mediaTypeFilter: AuthorMediaTypeFilter;
  mediaTypes: MediaTypeOption[];
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
  mediaTypes,
  statusFilter,
}: AuthorMediaFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
      nextSearchParams.delete("page");
      nextSearchParams.delete("published");
      nextSearchParams.delete("submitted");
      nextSearchParams.delete("withdrawn");
      nextSearchParams.delete("deleted");

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
  const {
    draft: search,
    resetDraft: resetSearch,
    setDraft: setSearch,
  } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (query) => replaceFilters({ q: query }),
  });

  function resetFilters() {
    resetSearch();
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-sm lg:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
      <div className="flex flex-col gap-2">
        <Label htmlFor="author-media-search">
          Поиск
        </Label>
        <Input
          id="author-media-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Название или оригинал"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="author-media-type-filter">
          Тип
        </Label>
        <Select
          id="author-media-type-filter"
          value={mediaTypeFilter}
          onChange={(event) =>
            replaceFilters({ type: event.target.value as AuthorMediaTypeFilter })
          }
        >
          <option value="all">Все типы</option>
          {mediaTypes.map((mediaType) => (
            <option key={mediaType.code} value={mediaType.code}>
              {getMediaTypeLabel(mediaType.code, mediaTypes)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="author-media-status-filter">
          Статус
        </Label>
        <Select
          id="author-media-status-filter"
          value={statusFilter}
          onChange={(event) =>
            replaceFilters({ status: event.target.value as AuthorMediaStatusFilter })
          }
        >
          <option value="all">Все статусы</option>
          {AUTHOR_MEDIA_STATUS_FILTERS.map((status: PublicationStatus) => (
            <option key={status} value={status}>
              {PUBLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={resetFilters}
        >
          Сбросить
        </Button>
      </div>
    </div>
  );
}
