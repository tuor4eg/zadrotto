"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  FolderOpen,
  Library,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  filterCatalogItems,
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseMediaTypeFilter,
  sortCatalogItems,
  type AuthorRatingFilter,
  type CatalogSort,
  type MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { AuthorRatingForm } from "@/app/author-rating-form";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";

type MediaItemsCatalogProps = {
  items: CatalogMediaItem[];
  currentAuthor: {
    name: string;
    code: string;
  } | null;
};

const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  title: "Название",
  release_year: "Год выпуска",
  media_type: "Тип медиа",
  average_score: "Средняя оценка",
  ratings_count: "Количество оценок",
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

function getAuthorRatingFilterTooltip(filter: AuthorRatingFilter) {
  return `Фильтр: ${AUTHOR_RATING_FILTER_LABELS[filter].toLowerCase()}`;
}

function ArchiveCover({
  className,
  item,
  mode = "cover",
}: {
  className?: string;
  item: CatalogMediaItem;
  mode?: "cover" | "contain";
}) {
  if (item.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.coverUrl}
        alt={`Обложка: ${item.title}`}
        className={className}
        style={{ objectFit: mode }}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 ${className ?? ""}`}
    >
      Без обложки
    </div>
  );
}

function RatingStars({ score }: { score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span className="font-mono text-xs tracking-[0.16em] text-stone-900" aria-hidden="true">
      {"★".repeat(filledStars)}
      <span className="text-stone-300">{"★".repeat(5 - filledStars)}</span>
    </span>
  );
}

export function MediaItemsCatalog({ items, currentAuthor }: MediaItemsCatalogProps) {
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
  const authorRatingFilter = currentAuthor
    ? parseAuthorRatingFilter(searchParams.get("mine"))
    : "all";
  const filteredItems = useMemo(
    () => filterCatalogItems(items, search, mediaTypeFilter, authorRatingFilter),
    [authorRatingFilter, items, mediaTypeFilter, search],
  );
  const sortedItems = useMemo(
    () => sortCatalogItems(filteredItems, catalogSort),
    [catalogSort, filteredItems],
  );
  const selectedItem = useMemo(
    () => sortedItems.find((item) => item.id === selectedId) ?? sortedItems[0] ?? null,
    [selectedId, sortedItems],
  );

  function replaceSearchParams(nextSearchParams: URLSearchParams) {
    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function handleSortChange(sort: CatalogSort) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("sort", sort);
    replaceSearchParams(nextSearchParams);
  }

  function handleAuthorRatingFilterChange(nextAuthorRatingFilter: AuthorRatingFilter) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextAuthorRatingFilter === "all") {
      nextSearchParams.delete("mine");
    } else {
      nextSearchParams.set("mine", nextAuthorRatingFilter);
    }

    replaceSearchParams(nextSearchParams);
  }

  function handleMediaTypeFilterChange(nextMediaTypeFilter: MediaTypeFilter) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextMediaTypeFilter === "all") {
      nextSearchParams.delete("type");
    } else {
      nextSearchParams.set("type", nextMediaTypeFilter);
    }

    replaceSearchParams(nextSearchParams);
  }

  if (items.length === 0) {
    return (
      <div className="archive-paper archive-panel p-6 text-sm text-stone-600">
        Пока в архиве нет записей.
      </div>
    );
  }

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
      <div className="archive-paper archive-panel min-w-0 p-4">
        <div className="rounded-md border border-stone-300/80 bg-stone-50/35 p-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="sr-only" htmlFor="catalog-search">
              Поиск
            </label>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
              <input
                id="catalog-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 pl-10 pr-3 text-sm text-stone-950 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] outline-none placeholder:text-stone-500 focus:border-stone-700"
                placeholder="Поиск по записям"
              />
            </div>

            {currentAuthor ? (
              <div
                className="relative h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700 sm:w-11"
                title={getAuthorRatingFilterTooltip(authorRatingFilter)}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none flex h-full w-full items-center justify-center"
                >
                  {AUTHOR_RATING_FILTER_ICONS[authorRatingFilter]}
                </span>
                <label className="sr-only" htmlFor="media-catalog-author-rating-filter">
                  Фильтр моих оценок
                </label>
                <select
                  id="media-catalog-author-rating-filter"
                  value={authorRatingFilter}
                  onChange={(event) =>
                    handleAuthorRatingFilterChange(event.target.value as AuthorRatingFilter)
                  }
                  aria-label={getAuthorRatingFilterTooltip(authorRatingFilter)}
                  title={getAuthorRatingFilterTooltip(authorRatingFilter)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {Object.entries(AUTHOR_RATING_FILTER_LABELS).map(([filter, label]) => (
                    <option key={filter} value={filter}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div
              className="relative h-11 w-full rounded-md border border-stone-300/80 bg-stone-50/80 text-stone-700 transition-colors hover:border-stone-700 sm:w-11"
              title={getSortTooltip(catalogSort)}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none flex h-full w-full items-center justify-center"
              >
                <SlidersHorizontal className="size-4" />
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

          <div
            role="tablist"
            aria-label="Тип медиа"
            className="mt-3 flex gap-2 overflow-x-auto pb-1 whitespace-nowrap"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mediaTypeFilter === "all"}
              onClick={() => handleMediaTypeFilterChange("all")}
              className={`shrink-0 rounded-md border px-4 py-2 text-sm transition-colors ${
                mediaTypeFilter === "all"
                  ? "border-stone-950 bg-stone-950 text-stone-50 shadow-sm"
                  : "border-stone-300/80 bg-stone-50/80 text-stone-700 hover:border-stone-700"
              }`}
            >
              Все
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
                  className={`shrink-0 rounded-md border px-4 py-2 text-sm transition-colors ${
                    isSelected
                      ? "border-stone-950 bg-stone-950 text-stone-50 shadow-sm"
                      : "border-stone-300/80 bg-stone-50/80 text-stone-700 hover:border-stone-700"
                  }`}
                >
                  {MEDIA_TYPE_LABELS[mediaType]}
                  <span className={isSelected ? "ml-2 text-stone-300" : "ml-2 text-stone-500"}>
                    {mediaTypeCounts.get(mediaType)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 px-1 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
          <span>Картотека</span>
          <span>
            {sortedItems.length} из {items.length}
          </span>
        </div>

        <div className="mt-3 flex max-h-[780px] flex-col gap-2 overflow-y-auto pr-1">
          {sortedItems.length === 0 ? (
            <div className="rounded-md border border-stone-300/80 bg-stone-50/60 p-5 text-sm text-stone-600">
              Ничего не найдено.
            </div>
          ) : null}
          {sortedItems.map((item) => {
            const isSelected = item.id === selectedItem?.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`relative grid w-full grid-cols-[18px_76px_minmax(0,1fr)_auto] gap-3 rounded-md border p-2 text-left transition-colors ${
                  isSelected
                    ? "border-red-900/60 bg-red-50/25 shadow-[inset_3px_0_0_#7f1d1d]"
                    : "border-stone-300/80 bg-stone-50/55 hover:border-stone-500 hover:bg-stone-50/80"
                }`}
                aria-pressed={isSelected}
              >
                <span className="mt-8 size-3 rounded-full border border-stone-400 bg-stone-200 shadow-[inset_0_1px_2px_rgba(68,64,60,0.35)]" />
                <span className="block aspect-[4/3] overflow-hidden rounded-sm border border-stone-300 bg-stone-200">
                  <ArchiveCover item={item} className="h-full w-full" />
                </span>
                <span className="min-w-0 self-center">
                  <span className="block truncate font-serif text-xl leading-tight text-stone-950">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-stone-700">
                    {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                    {item.releaseYear ? <span>•</span> : null}
                    <span>{MEDIA_TYPE_LABELS[item.mediaType].toLowerCase()}</span>
                    {item.franchiseTitle ? <span>•</span> : null}
                    {item.franchiseTitle ? (
                      <span className="min-w-0 truncate">{item.franchiseTitle}</span>
                    ) : null}
                  </span>
                </span>
                <span className="hidden shrink-0 grid-cols-2 gap-3 border-l border-dashed border-stone-300 pl-4 text-center sm:grid">
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
                      Архив
                    </span>
                    <span className="mt-1 block font-serif text-3xl tabular-nums text-stone-950">
                      {formatScore(item.averageScore)}
                    </span>
                  </span>
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
                      Моя
                    </span>
                    <span className="mt-1 block font-serif text-3xl tabular-nums text-red-900">
                      {formatScore(item.currentAuthorScore)}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <article className="archive-paper archive-panel min-w-0 overflow-hidden">
        {selectedItem ? (
          <div className="grid min-h-full lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1fr)]">
            <div className="relative border-b border-stone-300/80 bg-stone-200/30 p-6 lg:border-b-0 lg:border-r">
              <div className="absolute right-5 top-0 hidden h-20 w-7 rounded-b-full border-x-4 border-b-4 border-stone-500/70 lg:block" />
              <div className="font-mono text-lg uppercase tracking-[0.38em] text-stone-950">
                Досье
              </div>
              <div className="mt-6 mx-auto max-w-[380px] rounded-md border border-stone-400 bg-stone-950 p-2 shadow-2xl shadow-stone-950/25">
                <div className="rounded-sm border border-stone-700 bg-stone-900 p-3">
                  <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-stone-200">
                    Archive cover
                  </div>
                  <div className="aspect-[3/4] overflow-hidden rounded-sm bg-stone-800">
                    <ArchiveCover item={selectedItem} mode="cover" className="h-full w-full" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-[620px] flex-col justify-between gap-8 p-6 sm:p-8">
              <div>
                <div className="font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
                  {selectedItem.title}
                </div>
                {selectedItem.originalTitle &&
                selectedItem.originalTitle !== selectedItem.title ? (
                  <div className="mt-3 font-mono text-sm uppercase tracking-[0.16em] text-stone-600">
                    {selectedItem.originalTitle}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm text-stone-800">
                  <span>{MEDIA_TYPE_LABELS[selectedItem.mediaType].toLowerCase()}</span>
                  {selectedItem.releaseYear ? <span>•</span> : null}
                  {selectedItem.releaseYear ? <span>{selectedItem.releaseYear}</span> : null}
                  <span>•</span>
                  <span>{formatRatingsCount(selectedItem.ratingsCount)}</span>
                </div>

                <dl className="mt-8 grid gap-5 border-t border-dashed border-stone-300 pt-5 text-sm leading-6 text-stone-800 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Серия
                    </dt>
                    <dd className="mt-1">
                      {selectedItem.franchiseTitle && selectedItem.franchiseCode ? (
                        <Link
                          href={`/franchises/${selectedItem.franchiseCode}`}
                          className="font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
                        >
                          {selectedItem.franchiseTitle}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Код
                    </dt>
                    <dd className="mt-1 break-all font-mono text-stone-700">{selectedItem.code}</dd>
                  </div>
                </dl>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-4 text-center">
                    <div className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                      Оценка архива
                    </div>
                    <div className="mt-2 font-serif text-5xl tabular-nums text-stone-950">
                      {formatScore(selectedItem.averageScore)}
                    </div>
                    <div className="mt-2 flex justify-center">
                      <RatingStars score={selectedItem.averageScore} />
                    </div>
                  </div>
                  <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-4 text-center">
                    <div className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                      Ваша оценка
                    </div>
                    <div className="mt-2 font-serif text-5xl tabular-nums text-red-900">
                      {formatScore(selectedItem.currentAuthorScore)}
                    </div>
                    <div className="mt-2 flex justify-center">
                      <RatingStars score={selectedItem.currentAuthorScore} />
                    </div>
                  </div>
                </div>

                {selectedItem.description ? (
                  <div className="mt-8 rounded-md border border-stone-300/80 bg-stone-50/45 p-5">
                    <div className="mb-3 text-center font-mono text-xs uppercase tracking-[0.2em] text-stone-600">
                      Архивная заметка
                    </div>
                    <p className="font-mono text-base leading-7 text-stone-800">
                      {selectedItem.description}
                    </p>
                  </div>
                ) : null}

                <div className="mt-5">
                  <AuthorRatingForm
                    mediaItemCode={selectedItem.code}
                    franchiseCode={selectedItem.franchiseCode}
                    currentAuthor={currentAuthor}
                    currentAuthorScore={selectedItem.currentAuthorScore}
                    compact
                  />
                </div>
              </div>

              <Link
                href={`/media/${selectedItem.code}`}
                className="inline-flex w-fit items-center gap-3 rounded-md border border-stone-400 bg-stone-50/60 px-5 py-3 font-mono text-sm text-stone-950 transition-colors hover:border-stone-950 hover:bg-stone-100"
              >
                <FolderOpen className="size-5" />
                Открыть досье
                <ArrowRight className="size-5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center p-6 text-sm text-stone-600">
            Ничего не найдено.
          </div>
        )}
      </article>
    </section>
  );
}
