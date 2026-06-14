"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { MediaCatalogPreview } from "@/app/media-catalog-preview";
import {
  type AuthorRatingFilter,
  type CatalogSort,
  type CatalogSortDirection,
  type CatalogYearFilter,
  type CatalogYearMode,
  type MediaTypeFilter,
  DEFAULT_CATALOG_SORT_DIRECTIONS,
} from "@/app/media-items-catalog-logic";
import { MediaTypeTabs } from "@/app/media-type-tabs";
import { MediaItemTile } from "@/app/media-item-tile";
import { ArchiveCatalogLayout } from "@/components/archive/archive-catalog-layout";
import { PaginationNav } from "@/components/pagination-nav";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import {
  sortMediaTypesByCount,
  type MediaType,
  type MediaTypeOption,
} from "@/lib/media/types";

type MediaItemsCatalogProps = {
  authorRatingFilter: AuthorRatingFilter;
  defaultPageSize: number;
  items: CatalogMediaItem[];
  mediaTypeCounts: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypes: MediaTypeOption[];
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  totalCount: number;
  totalPages: number;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
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

export function MediaItemsCatalog({
  authorRatingFilter,
  currentAuthor,
  defaultPageSize,
  items,
  mediaTypeCounts: mediaTypeCountRows,
  mediaTypeFilter,
  mediaTypes,
  page,
  pageSize,
  pageSizeOptions,
  searchQuery,
  sort,
  sortDirection,
  totalCount,
  totalPages,
  yearFilter,
  yearMode,
}: MediaItemsCatalogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [, startTransition] = useTransition();
  const availableMediaTypes = useMemo(
    () =>
      sortMediaTypesByCount(mediaTypes, mediaTypeCountRows)
        .filter(
          (mediaType) =>
            mediaType.code === mediaTypeFilter ||
            mediaTypeCountRows.some((item) => item.mediaType === mediaType.code && item.count > 0),
        )
        .map((mediaType) => mediaType.code),
    [mediaTypeCountRows, mediaTypeFilter, mediaTypes],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );
  const archiveTotalCount = useMemo(
    () => mediaTypeCountRows.reduce((total, item) => total + item.count, 0),
    [mediaTypeCountRows],
  );
  const hasActiveFilters =
    authorRatingFilter !== "all" ||
    mediaTypeFilter !== "all" ||
    searchQuery !== "" ||
    yearFilter !== null;
  const hasItems = items.length > 0;
  const paginationSearchParams = {
    mine: currentAuthor && authorRatingFilter !== "all" ? authorRatingFilter : undefined,
    pageSize: pageSize !== defaultPageSize ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    dir:
      sortDirection !== DEFAULT_CATALOG_SORT_DIRECTIONS[sort]
        ? sortDirection
        : undefined,
    sort: sort !== "title" ? sort : undefined,
    type: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
    year: yearFilter !== null ? String(yearFilter) : undefined,
    yearMode: yearFilter !== null && yearMode !== "release" ? yearMode : undefined,
  };

  const replaceFilters = useCallback(
    (nextFilters: { type?: MediaTypeFilter }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("page");

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

  function handleMediaTypeFilterChange(nextMediaTypeFilter: MediaTypeFilter) {
    replaceFilters({ type: nextMediaTypeFilter });
  }

  if (archiveTotalCount === 0 && !hasActiveFilters) {
    return (
      <div className="archive-paper archive-panel p-6 text-sm text-stone-600">
        Пока в архиве нет записей.
      </div>
    );
  }

  return (
    <ArchiveCatalogLayout
      toolbar={
        hasItems ? (
          <MediaTypeTabs
            availableMediaTypes={availableMediaTypes}
            mediaTypeCounts={mediaTypeCountRows}
            mediaTypes={mediaTypes}
            selectedMediaType={mediaTypeFilter}
            onChange={handleMediaTypeFilterChange}
          />
        ) : null
      }
      footer={
        <PaginationNav
          basePath={pathname}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          searchParams={paginationSearchParams}
          showPageJump
          totalCount={totalCount}
          totalPages={totalPages}
          variant="archive"
        />
      }
      preview={
        <MediaCatalogPreview
          currentAuthor={currentAuthor}
          item={selectedItem}
          mediaTypes={mediaTypes}
        />
      }
      previewKey={selectedItem?.id ?? null}
    >
      {items.length === 0 ? (
        <div className="col-span-full rounded-md border border-stone-300/80 bg-stone-50/60 p-5 text-sm text-stone-600">
          Ничего не найдено.
        </div>
      ) : null}
      {items.map((item) => (
        <MediaItemTile
          key={item.id}
          currentAuthorScore={
            currentAuthor !== null ? item.currentAuthorScore : undefined
          }
          href={`/media/${item.code}`}
          item={item}
          onSelect={() => setSelectedId(item.id)}
          selected={selectedItem?.id === item.id}
        />
      ))}
    </ArchiveCatalogLayout>
  );
}
