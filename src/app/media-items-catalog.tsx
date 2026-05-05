"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  filterCatalogItems,
  formatRatingsCount,
  formatScore,
  parseCatalogSort,
  parseMediaTypeFilter,
  sortCatalogItems,
  type CatalogSort,
  type MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media-types";

type MediaItemsCatalogProps = {
  items: CatalogMediaItem[];
};

const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  title: "Название",
  release_year: "Год выпуска",
  media_type: "Тип медиа",
  average_score: "Средняя оценка",
  ratings_count: "Количество оценок",
};

function getSortTooltip(sort: CatalogSort) {
  return `Сортировка: ${CATALOG_SORT_LABELS[sort].toLowerCase()}`;
}

export function MediaItemsCatalog({ items }: MediaItemsCatalogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [search, setSearch] = useState("");
  const catalogSort = parseCatalogSort(searchParams.get("sort"));
  const availableMediaTypes = useMemo(
    () => MEDIA_TYPES.filter((mediaType) => items.some((item) => item.mediaType === mediaType)),
    [items],
  );
  const mediaTypeCounts = useMemo(
    () =>
      new Map(
        MEDIA_TYPES.map((mediaType) => [
          mediaType,
          items.filter((item) => item.mediaType === mediaType).length,
        ]),
      ),
    [items],
  );
  const parsedMediaTypeFilter = parseMediaTypeFilter(searchParams.get("type"));
  const mediaTypeFilter =
    parsedMediaTypeFilter === "all" || availableMediaTypes.includes(parsedMediaTypeFilter)
      ? parsedMediaTypeFilter
      : "all";
  const filteredItems = useMemo(
    () => filterCatalogItems(items, search, mediaTypeFilter),
    [items, mediaTypeFilter, search],
  );
  const sortedItems = useMemo(
    () => sortCatalogItems(filteredItems, catalogSort),
    [catalogSort, filteredItems],
  );
  const selectedItem = useMemo(
    () => sortedItems.find((item) => item.id === selectedId) ?? sortedItems[0],
    [selectedId, sortedItems],
  );

  function handleSortChange(sort: CatalogSort) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("sort", sort);

    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function handleMediaTypeFilterChange(nextMediaTypeFilter: MediaTypeFilter) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextMediaTypeFilter === "all") {
      nextSearchParams.delete("type");
    } else {
      nextSearchParams.set("type", nextMediaTypeFilter);
    }

    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  if (items.length === 0) {
    return (
      <div className="border border-zinc-300 bg-white p-5 text-sm text-zinc-500">
        Пока в архиве нет тайтлов.
      </div>
    );
  }

  return (
    <>
      <div className="border border-zinc-300 bg-white px-3 py-2">
        <div
          role="tablist"
          aria-label="Тип медиа"
          className="flex gap-1 overflow-x-auto whitespace-nowrap"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mediaTypeFilter === "all"}
            onClick={() => handleMediaTypeFilterChange("all")}
            className={`shrink-0 border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
              mediaTypeFilter === "all"
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-950 hover:text-zinc-950"
            }`}
          >
            <span>Все</span>
            <span
              className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                mediaTypeFilter === "all" ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {items.length}
            </span>
          </button>
          {availableMediaTypes.map((mediaType) => {
            const isSelected = mediaTypeFilter === mediaType;

            return (
              <button
                key={mediaType}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleMediaTypeFilterChange(mediaType)}
                className={`shrink-0 border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isSelected
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-950 hover:text-zinc-950"
                }`}
              >
                <span>{MEDIA_TYPE_LABELS[mediaType]}</span>
                <span
                  className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                    isSelected ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {mediaTypeCounts.get(mediaType)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
        <div className="border border-zinc-300 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Картотека
            </h2>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-zinc-200 p-3">
            <label className="sr-only" htmlFor="media-catalog-search">
              Поиск
            </label>
            <input
              id="media-catalog-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-950"
              placeholder="Название, оригинальное название, код"
            />
            <div
              className="relative h-9 w-9 border border-zinc-300 bg-white text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
              title={getSortTooltip(catalogSort)}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none flex h-full w-full items-center justify-center text-base leading-none"
              >
                ⇅
              </span>
              <label className="sr-only" htmlFor="media-catalog-sort">
                Сортировка
              </label>
              <select
                id="media-catalog-sort"
                value={catalogSort}
                onChange={(event) => handleSortChange(event.target.value as CatalogSort)}
                aria-label={getSortTooltip(catalogSort)}
                title={getSortTooltip(catalogSort)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {Object.entries(CATALOG_SORT_LABELS).map(([sort, label]) => (
                  <option key={sort} value={sort}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="divide-y divide-zinc-200">
            {sortedItems.length === 0 ? (
              <div className="p-5 text-sm text-zinc-500">Ничего не найдено.</div>
            ) : null}
            {sortedItems.map((item) => {
              const isSelected = item.id === selectedItem.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "bg-zinc-950 text-white"
                      : "bg-white text-zinc-900 hover:bg-zinc-100"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span
                      className={`mt-1 block text-xs uppercase tracking-[0.14em] ${
                        isSelected ? "text-zinc-300" : "text-zinc-500"
                      }`}
                    >
                      {MEDIA_TYPE_LABELS[item.mediaType]}
                    </span>
                  </span>
                  <span
                    className={`flex shrink-0 flex-col items-end gap-1 text-xs font-medium tabular-nums ${
                      isSelected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    <span>{formatScore(item.averageScore)}</span>
                    <span>{formatRatingsCount(item.ratingsCount)}</span>
                    {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <article className="border border-zinc-300 bg-white">
          {selectedItem ? (
            <div className="grid gap-0 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div className="aspect-[4/3] bg-zinc-200 sm:aspect-auto sm:min-h-[320px]">
                {selectedItem.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedItem.coverUrl}
                    alt={`Обложка: ${selectedItem.title}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e4e4e7,#fafafa)] px-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    No cover
                  </div>
                )}
              </div>

              <div className="flex min-h-[320px] flex-col justify-between gap-8 p-5 sm:p-6">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                    <span>{MEDIA_TYPE_LABELS[selectedItem.mediaType]}</span>
                    {selectedItem.releaseYear ? <span>{selectedItem.releaseYear}</span> : null}
                  </div>
                  {selectedItem.franchiseTitle && selectedItem.franchiseCode ? (
                    <Link
                      href={`/franchises/${selectedItem.franchiseCode}`}
                      className="w-fit border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                    >
                      Серия:{" "}
                      <span className="font-medium text-zinc-800">
                        {selectedItem.franchiseTitle}
                      </span>
                    </Link>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-semibold leading-tight text-zinc-950">
                      {selectedItem.title}
                    </h2>
                    {selectedItem.originalTitle &&
                    selectedItem.originalTitle !== selectedItem.title ? (
                      <p className="text-base text-zinc-500">{selectedItem.originalTitle}</p>
                    ) : null}
                    {selectedItem.description ? (
                      <p className="max-w-xl text-sm leading-6 text-zinc-600">
                        {selectedItem.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-fit border border-zinc-300 px-3 py-2">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Средний рейтинг
                    </span>
                    <span className="mt-1 block text-2xl font-semibold tabular-nums text-zinc-950">
                      {formatScore(selectedItem.averageScore)}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {formatRatingsCount(selectedItem.ratingsCount)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-zinc-200 pt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>#{selectedItem.id.toString().padStart(4, "0")}</span>
                    <Link
                      href={`/media/${selectedItem.code}`}
                      className="border border-zinc-300 px-3 py-2 text-zinc-950 transition-colors hover:border-zinc-950"
                    >
                      Открыть досье
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center p-6 text-sm text-zinc-500">
              Ничего не найдено.
            </div>
          )}
        </article>
      </section>
    </>
  );
}
