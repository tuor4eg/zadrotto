"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ArchiveSelect } from "@/components/ui/archive-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/common/utils";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { TierSeriesSelect } from "@/components/tier-lists/series-select";
import { SearchableFranchiseSelect } from "@/components/ui/searchable-franchise-select";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import {
  ADMIN_MEDIA_BROWSER_PAGE_SIZE_OPTIONS,
  DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE,
  type AdminMediaBrowserItem,
  type AdminMediaBrowserResult,
  type AdminMediaBrowserSeriesOption,
  type AdminMediaBrowserSort,
  type AdminMediaBrowserSortDirection,
  type AdminMediaBrowserSeriesScope,
} from "@/lib/admin/media-browser";
import { formatFactList, getStringListFact } from "@/lib/media/metadata-facts";
import type { MediaTypeOption } from "@/lib/media/types";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";

type AdminMediaBrowserProps = {
  className?: string;
  excludedIds?: readonly number[];
  endpoint?: string;
  maxSelection?: number;
  pageSize?: number;
  mediaTypes: readonly MediaTypeOption[];
  onConfirm: (items: AdminMediaBrowserItem[]) => void | boolean;
  series: readonly AdminMediaBrowserSeriesOption[];
  variant?: "admin" | "archive";
};

const ARCHIVE_CONTROL_CLASS =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300/80 bg-white px-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 disabled:pointer-events-none disabled:opacity-50";

function archiveChipClass(selected: boolean) {
  return cn(
    "rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950",
    selected
      ? "border-stone-950 bg-stone-950 text-stone-50"
      : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50 hover:text-stone-950",
  );
}

type BrowserFilters = {
  direction: AdminMediaBrowserSortDirection;
  mediaType: string;
  minAverageScore: string;
  maxAverageScore: string;
  page: number;
  pageSize: number;
  searchQuery: string;
  seriesId: string;
  seriesScope: AdminMediaBrowserSeriesScope;
  sort: AdminMediaBrowserSort;
};

const INITIAL_FILTERS: BrowserFilters = {
  direction: "asc",
  mediaType: "",
  minAverageScore: "",
  maxAverageScore: "",
  page: 1,
  pageSize: DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE,
  searchQuery: "",
  seriesId: "",
  seriesScope: "direct",
  sort: "title",
};

const DEFAULT_SORT_DIRECTIONS: Record<
  AdminMediaBrowserSort,
  AdminMediaBrowserSortDirection
> = {
  average_score: "desc",
  ratings_count: "desc",
  release_year: "desc",
  title: "asc",
};

const SORT_LABELS: Record<AdminMediaBrowserSort, string> = {
  average_score: "По средней оценке",
  ratings_count: "По количеству оценок",
  release_year: "По году",
  title: "По названию",
};

function buildBrowserRequestUrl(filters: BrowserFilters, endpoint: string) {
  const params = new URLSearchParams();

  if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());
  if (filters.mediaType) params.set("type", filters.mediaType);
  if (filters.seriesId) params.set("series", filters.seriesId);
  if (filters.seriesId && filters.seriesScope === "descendants") {
    params.set("seriesScope", "descendants");
  }
  if (filters.minAverageScore.trim()) {
    params.set("minScore", filters.minAverageScore.trim());
  }
  if (filters.maxAverageScore.trim()) params.set("maxScore", filters.maxAverageScore.trim());
  params.set("sort", filters.sort);
  params.set("direction", filters.direction);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));

  return `${endpoint}?${params.toString()}`;
}

function getCompactMetadata(item: AdminMediaBrowserItem) {
  const candidates = [
    item.genres.map((genre) => genre.name),
    getStringListFact(item.metadataFacts, "authors"),
    getStringListFact(item.metadataFacts, "developers"),
    (item.platforms ?? []).map((platform) => platform.name),
  ];
  const values = candidates.find((candidate) => candidate.length > 0) ?? [];

  return values.length > 0 ? formatFactList(values, 2) : null;
}

function BrowserCover({ item }: { item: AdminMediaBrowserItem }) {
  return (
    <ImageWithFallback
      alt={`Обложка: ${item.title}`}
      className="h-16 w-11 rounded-sm border border-stone-200 bg-stone-100 object-cover"
      fallback={
        <span
          aria-label={`Обложка не добавлена: ${item.title}`}
          className="grid h-16 w-11 place-items-center rounded-sm border border-dashed border-stone-300 bg-stone-50 text-[9px] uppercase text-stone-400"
        >
          нет
        </span>
      }
      loading="lazy"
      src={item.coverThumbUrl ?? item.coverUrl ?? undefined}
    />
  );
}

function BrowserItemSummary({ item }: { item: AdminMediaBrowserItem }) {
  const compactMetadata = getCompactMetadata(item);

  return (
    <div className="min-w-0">
      <div className="break-words font-medium leading-5 text-stone-950">{item.title}</div>
      {item.originalTitle && item.originalTitle !== item.title ? (
        <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline">{item.mediaTypeLabel}</Badge>
        {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
        {item.mediaCarrierName ? (
          <Badge variant="outline">{item.mediaCarrierName}</Badge>
        ) : null}
      </div>
      {item.franchises.length > 0 ? (
        <div className="mt-2 line-clamp-2 text-xs text-stone-500">
          {item.franchises.map((franchise) => franchise.title).join(" · ")}
        </div>
      ) : null}
      {compactMetadata ? (
        <div className="mt-1 line-clamp-1 text-xs text-stone-500">{compactMetadata}</div>
      ) : null}
    </div>
  );
}

export function AdminMediaBrowser({
  className,
  excludedIds = [],
  endpoint = "/api/admin/media-browser",
  maxSelection = Number.MAX_SAFE_INTEGER,
  pageSize = DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE,
  mediaTypes,
  onConfirm,
  series,
  variant = "admin",
}: AdminMediaBrowserProps) {
  const [filters, setFilters] = useState<BrowserFilters>(() => ({ ...INITIAL_FILTERS, pageSize }));
  const [result, setResult] = useState<AdminMediaBrowserResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState(
    () => new Map<number, AdminMediaBrowserItem>(),
  );
  const excludedIdSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const selectedAvailableItems = useMemo(
    () => [...selectedItems.values()].filter((item) => !excludedIdSet.has(item.id)),
    [excludedIdSet, selectedItems],
  );
  const requestUrl = useMemo(() => buildBrowserRequestUrl(filters, endpoint), [filters, endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(requestUrl, { signal: controller.signal });

        if (!response.ok) {
          setResult(null);
          setError(
            response.status === 401
              ? "Сессия истекла. Обновите страницу и войдите снова."
              : "Не удалось загрузить записи.",
          );
          return;
        }

        setResult((await response.json()) as AdminMediaBrowserResult);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setResult(null);
          setError("Не удалось загрузить записи.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [requestUrl]);

  function updateFilters(nextFilters: Partial<BrowserFilters>) {
    setFilters((current) => ({
      ...current,
      ...nextFilters,
      page: nextFilters.page ?? 1,
    }));
  }

  function toggleItem(item: AdminMediaBrowserItem) {
    if (excludedIdSet.has(item.id)) {
      return;
    }

    setSelectedItems((current) => {
      const next = new Map(current);

      if (next.has(item.id)) {
        next.delete(item.id);
      } else if ([...next.keys()].filter((id) => !excludedIdSet.has(id)).length < maxSelection) {
        next.set(item.id, item);
      }

      return next;
    });
  }

  const archive = variant === "archive";
  const selectablePageItems = (result?.items ?? []).filter(
    (item) => !excludedIdSet.has(item.id),
  );
  const selectedPageCount = selectablePageItems.filter((item) => selectedItems.has(item.id)).length;

  function selectCurrentPage() {
    setSelectedItems((current) => {
      const next = new Map(current);

      let count = [...next.keys()].filter((id) => !excludedIdSet.has(id)).length;
      for (const item of selectablePageItems) {
        if (next.has(item.id)) continue;
        if (count >= maxSelection) break;
        next.set(item.id, item);
        count += 1;
      }

      return next;
    });
  }

  function clearCurrentPage() {
    const pageIds = new Set(selectablePageItems.map((item) => item.id));

    setSelectedItems(
      (current) => new Map([...current].filter(([itemId]) => !pageIds.has(itemId))),
    );
  }

  function confirmSelection() {
    if (selectedAvailableItems.length === 0 || selectedAvailableItems.length > maxSelection) {
      return;
    }

    if (onConfirm(selectedAvailableItems) !== false) {
      setSelectedItems(new Map());
    }
  }

  return (
    <section
      aria-label="Браузер записей архива"
      className={cn("grid min-w-0 gap-4 rounded-lg border border-stone-200 bg-stone-50/70 p-4", className)}
    >
      <div className={cn("grid gap-3", archive ? "lg:grid-cols-6 lg:items-end" : "lg:grid-cols-2")}>
        <div className={archive ? "lg:col-span-6" : "lg:col-span-2"}>
          <Label className="sr-only" htmlFor="admin-media-browser-search">
            Поиск по названию
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <Input
              id="admin-media-browser-search"
              className={archive ? "h-10 border-stone-300/80 bg-stone-50/70 pl-10 font-mono text-sm placeholder:text-stone-400 focus:border-stone-950" : "pl-9"}
              onChange={(event) => updateFilters({ searchQuery: event.currentTarget.value })}
              placeholder="Название, оригинальное название или алиас"
              type="search"
              value={filters.searchQuery}
            />
          </div>
        </div>

        <div className={archive ? "grid content-start gap-2 lg:col-span-6" : "grid content-start gap-2"}>
          <Label id="admin-media-browser-type-label" htmlFor={archive ? undefined : "admin-media-browser-type"}>Тип записи</Label>
          {archive ? (
            <div aria-labelledby="admin-media-browser-type-label" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={filters.mediaType === ""}
                className={archiveChipClass(filters.mediaType === "")}
                onClick={() => updateFilters({ mediaType: "" })}
              >
                Все типы
              </button>
              {mediaTypes.map((mediaType) => (
                <button
                  key={mediaType.code}
                  type="button"
                  aria-pressed={filters.mediaType === mediaType.code}
                  className={archiveChipClass(filters.mediaType === mediaType.code)}
                  onClick={() => updateFilters({ mediaType: mediaType.code })}
                >
                  {mediaType.name}
                </button>
              ))}
            </div>
          ) : (
            <Select
              id="admin-media-browser-type"
              onChange={(event) => updateFilters({ mediaType: event.currentTarget.value })}
              value={filters.mediaType}
            >
              <option value="">Все типы</option>
              {mediaTypes.map((mediaType) => (
                <option key={mediaType.code} value={mediaType.code}>
                  {mediaType.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className={cn("grid content-start gap-2", archive && "lg:col-span-2")}>
          <Label htmlFor="admin-media-browser-series">Серия</Label>
          {endpoint === "/api/tier-lists/media-browser" ? <TierSeriesSelect id="admin-media-browser-series" variant={variant} value={filters.seriesId} onChange={(seriesId) => updateFilters({ seriesId })} /> : <SearchableFranchiseSelect
            emptyLabel="Все серии"
            id="admin-media-browser-series"
            name="mediaBrowserSeriesId"
            onChange={(seriesId) => updateFilters({ seriesId })}
            options={series}
            searchByTitleOnly
            value={filters.seriesId}
          />}
          {archive ? null : (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                checked={filters.seriesScope === "descendants"}
                disabled={!filters.seriesId}
                onChange={(event) =>
                  updateFilters({
                    seriesScope: event.currentTarget.checked ? "descendants" : "direct",
                  })
                }
                type="checkbox"
              />
              Учитывать дочерние серии
            </label>
          )}
        </div>

        <div className={cn("grid items-end gap-2 sm:grid-cols-2", archive && "lg:col-span-4")}>
          <div className="grid gap-2">
            <Label htmlFor="admin-media-browser-min-score">Минимальная средняя оценка</Label>
            <Input
              id="admin-media-browser-min-score"
              className={archive ? "h-10 border-stone-300/80 bg-stone-50/70 font-mono text-sm placeholder:text-stone-400 focus:border-stone-950" : undefined}
              inputMode="decimal"
              max="10"
              min="1"
              onChange={(event) => updateFilters({ minAverageScore: event.currentTarget.value })}
              placeholder="Например, 7.5"
              step="0.1"
              type="number"
              value={filters.minAverageScore}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-media-browser-max-score">Максимальная средняя оценка</Label>
            <Input id="admin-media-browser-max-score" className={archive ? "h-10 border-stone-300/80 bg-stone-50/70 font-mono text-sm placeholder:text-stone-400 focus:border-stone-950" : undefined} inputMode="decimal" max="10" min="1" step="0.1" type="number" placeholder="Например, 9.5" value={filters.maxAverageScore} onChange={event => updateFilters({ maxAverageScore: event.currentTarget.value })} />
          </div>
        </div>

        {archive ? (
          <label className="flex items-center gap-2 text-sm text-stone-600 lg:col-span-6">
            <input
              checked={filters.seriesScope === "descendants"}
              disabled={!filters.seriesId}
              onChange={(event) =>
                updateFilters({
                  seriesScope: event.currentTarget.checked ? "descendants" : "direct",
                })
              }
              type="checkbox"
            />
            Учитывать дочерние серии
          </label>
        ) : null}

        <div className={cn("grid items-end gap-2", archive ? "sm:grid-cols-2 lg:col-span-6" : "sm:grid-cols-[minmax(0,1fr)_8rem]")}>
          <div className="grid gap-2">
            <Label htmlFor={archive ? undefined : "admin-media-browser-sort"}>Сортировка</Label>
            {archive ? (
              <ArchiveSelect
                ariaLabel="Сортировка"
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 justify-between"
                onChange={(value) => {
                  const sort = value as AdminMediaBrowserSort
                  updateFilters({ direction: DEFAULT_SORT_DIRECTIONS[sort], sort })
                }}
                options={Object.entries(SORT_LABELS).map(([value, label]) => ({ label, value }))}
                value={filters.sort}
              />
            ) : (
              <Select
                id="admin-media-browser-sort"
                onChange={(event) => {
                  const sort = event.currentTarget.value as AdminMediaBrowserSort;
                  updateFilters({ direction: DEFAULT_SORT_DIRECTIONS[sort], sort });
                }}
                value={filters.sort}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={archive ? undefined : "admin-media-browser-direction"}>Направление</Label>
            {archive ? (
              <ArchiveSelect
                ariaLabel="Направление"
                className="w-full"
                triggerClassName="h-10 w-full min-w-0 justify-between"
                onChange={(value) => updateFilters({ direction: value as AdminMediaBrowserSortDirection })}
                options={[
                  { label: "По возрастанию", value: "asc" },
                  { label: "По убыванию", value: "desc" },
                ]}
                value={filters.direction}
              />
            ) : (
              <Select
                id="admin-media-browser-direction"
                onChange={(event) =>
                  updateFilters({
                    direction: event.currentTarget.value as AdminMediaBrowserSortDirection,
                  })
                }
                value={filters.direction}
              >
                <option value="asc">По возрастанию</option>
                <option value="desc">По убыванию</option>
              </Select>
            )}
          </div>
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t pt-4", archive ? "border-stone-300/70" : "border-stone-200")}>
        <div className="flex flex-wrap items-center gap-2">
          {archive ? (
            <>
              <button
                type="button"
                className={ARCHIVE_CONTROL_CLASS}
                disabled={selectedAvailableItems.length >= maxSelection || selectablePageItems.length === 0 || selectedPageCount === selectablePageItems.length}
                onClick={selectCurrentPage}
              >
                Выбрать страницу
              </button>
              <button
                type="button"
                className={ARCHIVE_CONTROL_CLASS}
                disabled={selectedPageCount === 0}
                onClick={clearCurrentPage}
              >
                Снять выбор со страницы
              </button>
            </>
          ) : (
            <>
              <Button
                disabled={selectedAvailableItems.length >= maxSelection || selectablePageItems.length === 0 || selectedPageCount === selectablePageItems.length}
                onClick={selectCurrentPage}
                size="sm"
                variant="secondary"
              >
                Выбрать страницу
              </Button>
              <Button
                disabled={selectedPageCount === 0}
                onClick={clearCurrentPage}
                size="sm"
                variant="ghost"
              >
                Снять выбор со страницы
              </Button>
            </>
          )}
        </div>
        {archive ? (
          <button type="button" className={ARCHIVE_CONTROL_CLASS} onClick={() => setFilters({ ...INITIAL_FILTERS, pageSize })}>
            <X className="size-3.5" />
            Сбросить фильтры
          </button>
        ) : (
          <Button onClick={() => setFilters(INITIAL_FILTERS)} size="sm" variant="outline">
            <X />
            Сбросить фильтры
          </Button>
        )}
      </div>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {loading ? <p className="text-sm text-stone-500" role="status">Загружаем записи…</p> : null}
      {!loading && !error && result?.items.length === 0 ? (
        <p className={cn("rounded-md border p-4 text-sm", archive ? "border-stone-300/80 bg-stone-50/60 text-stone-600" : "border-stone-200 bg-white text-stone-500")}>
          По этим фильтрам записей нет.
        </p>
      ) : null}

      {archive && !error && result && result.items.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-stone-300/70">
          {result.items.map((item) => {
            const excluded = excludedIdSet.has(item.id)
            const selected = selectedItems.has(item.id)

            return (
              <label
                key={item.id}
                className={cn(
                  "grid grid-cols-[auto_2.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-stone-300/60 px-3 py-2 last:border-b-0 sm:grid-cols-[auto_2.75rem_minmax(0,1fr)_5.5rem_6.5rem]",
                  excluded ? "opacity-60" : selected ? "bg-stone-950/5" : "hover:bg-stone-50/60",
                )}
              >
                <input
                  aria-label={`Выбрать запись ${item.title}`}
                  checked={selected || excluded}
                  className="size-4"
                  disabled={excluded || (!selected && selectedAvailableItems.length >= maxSelection)}
                  onChange={() => toggleItem(item)}
                  type="checkbox"
                />
                <BrowserCover item={item} />
                <div className="min-w-0">
                  <BrowserItemSummary item={item} />
                  {excluded ? <Badge className="mt-2" variant="outline">Уже добавлена</Badge> : null}
                </div>
                <span className="col-start-3 font-mono text-xs tabular-nums text-stone-700 sm:col-auto sm:text-right">
                  {formatScore(item.averageScore)}
                </span>
                <span className="col-start-3 text-xs text-stone-500 sm:col-auto sm:text-right">
                  {formatRatingsCount(item.ratingsCount)}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}

      {!archive && !error && result && result.items.length > 0 ? (
        <>
          <div className="grid gap-3 md:hidden">
            {result.items.map((item) => {
              const excluded = excludedIdSet.has(item.id);
              const selected = selectedItems.has(item.id);

              return (
                <label
                  key={item.id}
                  className={`flex gap-3 rounded-lg border bg-white p-3 shadow-sm ${
                    excluded ? "border-stone-200 opacity-60" : selected ? "border-stone-950" : "border-stone-200"
                  }`}
                >
                  <input
                    aria-label={`Выбрать запись ${item.title}`}
                    checked={selected || excluded}
                    className="mt-1 size-4 shrink-0"
                    disabled={excluded || (!selected && selectedAvailableItems.length >= maxSelection)}
                    onChange={() => toggleItem(item)}
                    type="checkbox"
                  />
                  <BrowserCover item={item} />
                  <div className="min-w-0 flex-1">
                    <BrowserItemSummary item={item} />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                      <span>Средняя: {formatScore(item.averageScore)}</span>
                      <span>{formatRatingsCount(item.ratingsCount)}</span>
                      {excluded ? <Badge variant="outline">Уже добавлена</Badge> : null}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <TableWrap className="hidden overflow-x-auto md:block">
            <Table>
              <THead>
                <tr>
                  <TH className="w-12"><span className="sr-only">Выбор</span></TH>
                  <TH>Запись</TH>
                  <TH className="w-28">Средняя</TH>
                  <TH className="w-32">Оценки</TH>
                </tr>
              </THead>
              <TBody>
                {result.items.map((item) => {
                  const excluded = excludedIdSet.has(item.id);
                  const selected = selectedItems.has(item.id);

                  return (
                    <TR key={item.id} className={excluded ? "opacity-60" : selected ? "bg-stone-100" : undefined}>
                      <TD>
                        <input
                          aria-label={`Выбрать запись ${item.title}`}
                          checked={selected || excluded}
                          className="size-4"
                          disabled={excluded || (!selected && selectedAvailableItems.length >= maxSelection)}
                          onChange={() => toggleItem(item)}
                          type="checkbox"
                        />
                      </TD>
                      <TD>
                        <div className="flex min-w-0 items-start gap-3">
                          <BrowserCover item={item} />
                          <div className="min-w-0 flex-1">
                            <BrowserItemSummary item={item} />
                            {excluded ? <Badge className="mt-2" variant="outline">Уже добавлена</Badge> : null}
                          </div>
                        </div>
                      </TD>
                      <TD className="font-mono tabular-nums">{formatScore(item.averageScore)}</TD>
                      <TD>{formatRatingsCount(item.ratingsCount)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </>
      ) : null}

      {result ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={archive ? "font-mono text-xs uppercase tracking-[0.12em] text-stone-500" : "text-xs text-stone-500"}>
            Страница {result.page} из {result.totalPages} · найдено {result.totalCount}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-media-browser-page-size" className="font-mono text-xs uppercase tracking-wider text-stone-500">На странице</label>
            <Select id="admin-media-browser-page-size" aria-label="Записей на странице" className="h-9 w-20 shrink-0 bg-stone-50 font-mono text-xs" value={filters.pageSize} onChange={event => updateFilters({ pageSize: Number(event.currentTarget.value) })}>
              {ADMIN_MEDIA_BROWSER_PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
            </Select>
            {archive ? (
              <>
                <button
                  type="button"
                  aria-label="Предыдущая страница"
                  className={cn(ARCHIVE_CONTROL_CLASS, "size-9 px-0")}
                  disabled={loading || result.page <= 1}
                  onClick={() => updateFilters({ page: result.page - 1 })}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Следующая страница"
                  className={cn(ARCHIVE_CONTROL_CLASS, "size-9 px-0")}
                  disabled={loading || result.page >= result.totalPages}
                  onClick={() => updateFilters({ page: result.page + 1 })}
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            ) : (
              <>
                <Button
                  aria-label="Предыдущая страница"
                  disabled={loading || result.page <= 1}
                  onClick={() => updateFilters({ page: result.page - 1 })}
                  size="icon"
                  variant="outline"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  aria-label="Следующая страница"
                  disabled={loading || result.page >= result.totalPages}
                  onClick={() => updateFilters({ page: result.page + 1 })}
                  size="icon"
                  variant="outline"
                >
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className={cn("sticky bottom-0 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between", archive ? "rounded-md border border-stone-300/80 bg-stone-50/80" : "rounded-md border border-stone-200 bg-white shadow-sm")}>
        <span className="text-sm text-stone-600">
          Выбрано: <strong className="text-stone-950">{selectedAvailableItems.length}</strong>{maxSelection !== Number.MAX_SAFE_INTEGER ? ` · Можно добавить ещё: ${Math.max(0, maxSelection - selectedAvailableItems.length)}` : null}
        </span>
        {archive ? (
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-stone-950 px-4 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-50 transition-colors hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            disabled={selectedAvailableItems.length === 0 || selectedAvailableItems.length > maxSelection}
            onClick={confirmSelection}
          >
            Добавить выбранные
          </button>
        ) : (
          <Button className="w-full sm:w-auto" disabled={selectedAvailableItems.length === 0 || selectedAvailableItems.length > maxSelection} onClick={confirmSelection}>
            Добавить выбранные
          </Button>
        )}
      </div>
    </section>
  );
}
