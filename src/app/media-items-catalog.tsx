"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  FolderOpen,
} from "lucide-react";

import {
  type AuthorRatingFilter,
  type CatalogSort,
  type MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { ArchiveNote } from "@/app/archive-note";
import { MediaTypeTabs } from "@/app/media-type-tabs";
import { PaginationNav } from "@/components/pagination-nav";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";
import {
  AVERAGE_RATING_TONE_CLASS_NAMES,
  AUTHOR_RATING_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/rating-tone";

type MediaItemsCatalogProps = {
  authorRatingFilter: AuthorRatingFilter;
  defaultPageSize: number;
  items: CatalogMediaItem[];
  mediaTypeCounts: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypeFilter: MediaTypeFilter;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  searchQuery: string;
  sort: CatalogSort;
  totalCount: number;
  totalPages: number;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
};

type FixedDetailsState = {
  height: number;
  isFixed: boolean;
  left: number;
  minHeight: number;
  width: number;
};

const FIXED_DETAILS_TOP_OFFSET = 96;
const FIXED_DETAILS_BOTTOM_OFFSET = 16;

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

export function MediaItemsCatalog({
  authorRatingFilter,
  currentAuthor,
  defaultPageSize,
  items,
  mediaTypeCounts: mediaTypeCountRows,
  mediaTypeFilter,
  page,
  pageSize,
  pageSizeOptions,
  searchQuery,
  sort,
  totalCount,
  totalPages,
}: MediaItemsCatalogProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailsPanelRef = useRef<HTMLElement>(null);
  const detailsSlotRef = useRef<HTMLDivElement>(null);
  const detailsFrameRef = useRef<number | null>(null);
  const [fixedDetails, setFixedDetails] = useState<FixedDetailsState>({
    height: 0,
    isFixed: false,
    left: 0,
    minHeight: 0,
    width: 0,
  });
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [, startTransition] = useTransition();
  const availableMediaTypes = useMemo(
    () =>
      MEDIA_TYPES.filter((mediaType) =>
        mediaTypeCountRows.some((item) => item.mediaType === mediaType && item.count > 0),
      ),
    [mediaTypeCountRows],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );
  const archiveTotalCount = useMemo(
    () => mediaTypeCountRows.reduce((total, item) => total + item.count, 0),
    [mediaTypeCountRows],
  );
  const paginationSearchParams = {
    mine: currentAuthor && authorRatingFilter !== "all" ? authorRatingFilter : undefined,
    pageSize: pageSize !== defaultPageSize ? String(pageSize) : undefined,
    q: searchQuery || undefined,
    sort: sort !== "title" ? sort : undefined,
    type: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
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

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 1280px)");

    function updateFixedDetails() {
      const detailsPanel = detailsPanelRef.current;
      const detailsSlot = detailsSlotRef.current;

      if (!detailsPanel || !detailsSlot || !desktopMediaQuery.matches) {
        setFixedDetails((currentState) =>
          currentState.isFixed || currentState.height > 0
            ? { height: 0, isFixed: false, left: 0, minHeight: 0, width: 0 }
            : currentState,
        );
        return;
      }

      const slotRect = detailsSlot.getBoundingClientRect();
      const availableHeight = Math.max(
        0,
        window.innerHeight - FIXED_DETAILS_TOP_OFFSET - FIXED_DETAILS_BOTTOM_OFFSET,
      );
      const height = Math.max(detailsPanel.offsetHeight, availableHeight);
      const nextState: FixedDetailsState = {
        height,
        isFixed: slotRect.top <= FIXED_DETAILS_TOP_OFFSET,
        left: slotRect.left,
        minHeight: availableHeight,
        width: slotRect.width,
      };

      setFixedDetails((currentState) =>
        currentState.height === nextState.height &&
        currentState.isFixed === nextState.isFixed &&
        Math.round(currentState.left) === Math.round(nextState.left) &&
        Math.round(currentState.minHeight) === Math.round(nextState.minHeight) &&
        Math.round(currentState.width) === Math.round(nextState.width)
          ? currentState
          : nextState,
      );
    }

    function scheduleFixedDetailsUpdate() {
      if (detailsFrameRef.current !== null) {
        return;
      }

      detailsFrameRef.current = window.requestAnimationFrame(() => {
        detailsFrameRef.current = null;
        updateFixedDetails();
      });
    }

    updateFixedDetails();
    window.addEventListener("scroll", scheduleFixedDetailsUpdate, { passive: true });
    window.addEventListener("resize", scheduleFixedDetailsUpdate);
    desktopMediaQuery.addEventListener("change", scheduleFixedDetailsUpdate);

    return () => {
      if (detailsFrameRef.current !== null) {
        window.cancelAnimationFrame(detailsFrameRef.current);
      }

      window.removeEventListener("scroll", scheduleFixedDetailsUpdate);
      window.removeEventListener("resize", scheduleFixedDetailsUpdate);
      desktopMediaQuery.removeEventListener("change", scheduleFixedDetailsUpdate);
    };
  }, [selectedItem?.id]);

  if (archiveTotalCount === 0) {
    return (
      <div className="archive-paper archive-panel p-6 text-sm text-stone-600">
        Пока в архиве нет записей.
      </div>
    );
  }

  return (
    <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.28fr)]">
      <div className="archive-paper archive-panel archive-stack archive-stack-right flex min-h-0 min-w-0 flex-col p-4">
        <MediaTypeTabs
          availableMediaTypes={availableMediaTypes}
          selectedMediaType={mediaTypeFilter}
          onChange={handleMediaTypeFilterChange}
        />

        <div className="archive-scrollbar mt-2 grid min-h-0 flex-1 grid-cols-3 content-start gap-2.5 overflow-y-auto pl-1 pr-1 md:grid-cols-4 xl:grid-cols-6">
          {items.length === 0 ? (
            <div className="col-span-full rounded-md border border-stone-300/80 bg-stone-50/60 p-5 text-sm text-stone-600">
              Ничего не найдено.
            </div>
          ) : null}
          {items.map((item) => {
            const shouldShowAuthorScore =
              currentAuthor !== null && item.currentAuthorScore !== null;
            const averageRatingToneClassName =
              AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(item.averageScore)];
            const authorRatingToneClassName =
              AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(item.currentAuthorScore)];

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`group relative block aspect-square overflow-hidden rounded-md border bg-stone-100 text-left shadow-[0_2px_0_rgba(68,64,60,0.10)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-red-900/60 hover:shadow-[0_8px_18px_rgba(68,64,60,0.20)] focus-visible:-translate-y-0.5 focus-visible:border-red-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900/35 ${
                  selectedItem?.id === item.id ? "border-red-900/70" : "border-stone-300/80"
                }`}
                aria-pressed={selectedItem?.id === item.id}
              >
                <ArchiveCover
                  item={item}
                  className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
                />
                <span aria-hidden="true" className="absolute inset-0 bg-stone-950/10" />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-stone-950/82 via-stone-950/30 to-transparent"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-stone-950/82 via-stone-950/24 to-transparent"
                />
                <span className="absolute inset-x-0 top-0 p-2.5 text-stone-50">
                  <span className="block line-clamp-2 font-serif text-base leading-tight drop-shadow">
                    {item.title}
                  </span>
                  {mediaTypeFilter === "all" ? (
                    <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-stone-200">
                      {MEDIA_TYPE_LABELS[item.mediaType]}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`absolute bottom-2 right-2 inline-flex h-8 items-center justify-center rounded-full border text-center shadow-sm ${averageRatingToneClassName} ${
                    shouldShowAuthorScore ? "gap-1.5 pl-2.5 pr-1" : "w-8"
                  }`}
                >
                  <span className="min-w-4 text-center font-mono text-sm leading-none tabular-nums">
                    {formatScore(item.averageScore)}
                  </span>
                  {shouldShowAuthorScore ? (
                    <span
                      className={`grid size-7 place-items-center rounded-full border text-center shadow-sm ${authorRatingToneClassName}`}
                    >
                      <span className="min-w-4 text-center font-mono text-base leading-none tabular-nums">
                        {formatScore(item.currentAuthorScore)}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="absolute bottom-3 left-2.5 right-[4.25rem] flex min-w-0 flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] leading-4 text-stone-200">
                  {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                  {item.releaseYear && item.franchiseTitle ? <span>•</span> : null}
                  {item.franchiseTitle ? (
                    <span className="min-w-0 truncate">{item.franchiseTitle}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 pl-1 pr-4">
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
        </div>
      </div>

      <div
        ref={detailsSlotRef}
        className="relative min-w-0 overflow-visible"
        style={fixedDetails.isFixed ? { minHeight: fixedDetails.height } : undefined}
      >
        <article
          ref={detailsPanelRef}
          className="archive-paper archive-panel archive-stack archive-stack-left relative min-w-0 overflow-visible"
          style={
            fixedDetails.isFixed
              ? {
                  left: fixedDetails.left,
                  minHeight: fixedDetails.minHeight,
                  position: "fixed",
                  top: FIXED_DETAILS_TOP_OFFSET,
                  width: fixedDetails.width,
                  zIndex: 20,
                }
              : fixedDetails.minHeight > 0
                ? { minHeight: fixedDetails.minHeight }
                : undefined
          }
        >
          {selectedItem ? (
            <div className="relative p-4 sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/clip-transparent-trimmed.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 right-4 z-30 h-20 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:right-6 sm:h-24"
              />
              <div className="relative -ml-2 rotate-[0.35deg] border border-stone-400/70 bg-[linear-gradient(135deg,rgb(var(--archive-paper-start)),rgb(var(--archive-paper-end)))] p-4 shadow-[0_15px_32px_rgba(28,25,23,0.20),inset_0_0_0_1px_rgba(255,255,255,0.45)] sm:p-5">
                <div className="font-mono text-sm uppercase tracking-[0.34em] text-stone-950">
                  Досье
                </div>

                <div className="mt-4 overflow-hidden rounded-sm border border-stone-400 bg-stone-950 p-2 shadow-xl shadow-stone-950/20">
                  <div className="aspect-[4/3] overflow-hidden rounded-sm bg-stone-800">
                    <ArchiveCover item={selectedItem} className="h-full w-full" />
                  </div>
                </div>

                <div className="mt-4 font-serif text-2xl leading-none text-stone-950">
                  {selectedItem.title}
                </div>
                {selectedItem.originalTitle && selectedItem.originalTitle !== selectedItem.title ? (
                  <div className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-stone-600">
                    {selectedItem.originalTitle}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-stone-800">
                  <span>{MEDIA_TYPE_LABELS[selectedItem.mediaType].toLowerCase()}</span>
                  {selectedItem.releaseYear ? <span>•</span> : null}
                  {selectedItem.releaseYear ? <span>{selectedItem.releaseYear}</span> : null}
                  <span>•</span>
                  <span>{formatRatingsCount(selectedItem.ratingsCount)}</span>
                </div>

                <div className="mt-4 grid gap-2 border-t border-dashed border-stone-300 pt-4 sm:grid-cols-2">
                  <div
                    className={`rounded-md border p-2 text-center ${AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(selectedItem.averageScore)]}`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
                      Оценка
                    </div>
                    <div className="mt-1 font-serif text-3xl tabular-nums">
                      {formatScore(selectedItem.averageScore)}
                    </div>
                  </div>
                  {currentAuthor && selectedItem.currentAuthorScore !== null ? (
                    <div
                      className={`rounded-md border p-2 text-center ${AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(selectedItem.currentAuthorScore)]}`}
                    >
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-75">
                        Моя
                      </div>
                      <div className="mt-1 font-serif text-3xl tabular-nums">
                        {formatScore(selectedItem.currentAuthorScore)}
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedItem.franchiseTitle && selectedItem.franchiseCode ? (
                  <div className="mt-5 border-t border-dashed border-stone-300 pt-4 text-sm leading-6 text-stone-800">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Серия
                    </div>
                    <Link
                      href={`/franchises/${selectedItem.franchiseCode}`}
                      className="mt-1 inline-block font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
                    >
                      {selectedItem.franchiseTitle}
                    </Link>
                  </div>
                ) : null}

                {selectedItem.description ? (
                  <div className="mt-6">
                    <ArchiveNote text={selectedItem.description} maxWidthClassName="max-w-full" />
                  </div>
                ) : null}

                <Link
                  href={`/media/${selectedItem.code}`}
                  className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-md border border-stone-400 bg-stone-50/65 px-4 py-3 font-mono text-sm text-stone-950 transition-colors hover:border-stone-950 hover:bg-stone-100"
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
      </div>
    </section>
  );
}
