"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Minus, Plus, Search } from "lucide-react";

import {
  addAuthorSeriesMediaLinkAction,
  removeAuthorSeriesMediaLinkAction,
} from "./actions";
import { cn } from "@/lib/common/utils";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";

type SearchItem = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  mediaType: MediaType;
  releaseYear: number | null;
  linkStatus: "private" | "submitted" | "published" | "rejected" | null;
  canRemove: boolean;
};

export function SeriesMediaLinkSearch({
  franchiseCode,
  mediaTypes,
}: {
  franchiseCode: string;
  mediaTypes: MediaTypeOption[];
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const queryRef = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [scrollShadow, setScrollShadow] = useState({ bottom: false, top: false });
  const updateScrollShadow = useCallback(() => {
    const scrollArea = scrollAreaRef.current;

    if (!scrollArea) {
      setScrollShadow({ bottom: false, top: false });
      return;
    }

    const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;

    setScrollShadow({
      bottom: scrollArea.scrollTop < maxScrollTop - 1,
      top: scrollArea.scrollTop > 1,
    });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/series/${encodeURIComponent(franchiseCode)}/media-search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setItems([]);
          setSearchError(
            response.status === 401
              ? "Сессия истекла. Обновите страницу и войдите снова."
              : "Не удалось найти записи. Попробуйте ещё раз.",
          );
          return;
        }

        const payload = (await response.json()) as { items: SearchItem[] };
        setItems(payload.items);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setItems([]);
          setSearchError("Не удалось найти записи. Попробуйте ещё раз.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setResolvedQuery(normalizedQuery);
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [franchiseCode, query]);

  function mutateLink(item: SearchItem) {
    if (pendingId !== null) {
      return;
    }

    const mutationQuery = normalizedQuery;
    setPendingId(item.id);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = item.canRemove
          ? await removeAuthorSeriesMediaLinkAction({
              franchiseCode,
              mediaItemCode: item.code,
            })
          : await addAuthorSeriesMediaLinkAction({
              franchiseCode,
              mediaItemCode: item.code,
            });

        if (!result.success) {
          setMessage(
            result.error === "duplicate"
              ? "Связь уже существует."
              : "Не удалось изменить связь.",
          );
        } else {
          if (
            result.linkStatus === "published" &&
            visibleItems.length === 1 &&
            queryRef.current.trim() === mutationQuery
          ) {
            setOpen(false);
            queryRef.current = "";
            setQuery("");
            setItems([]);
            setResolvedQuery("");
            setSearchError(null);
            setMessage(null);
            return;
          }

          if (result.removalStatus === "requested") {
            setItems((currentItems) => currentItems.map((currentItem) =>
              currentItem.id === item.id ? { ...currentItem, canRemove: false } : currentItem,
            ));
            setMessage("Запрос на удаление отправлен на проверку.");
            return;
          }
          setItems((currentItems) =>
            result.linkStatus === "published"
              ? currentItems.filter((currentItem) => currentItem.id !== item.id)
              : currentItems.map((currentItem) =>
                  currentItem.id === item.id
                    ? {
                        ...currentItem,
                        canRemove: result.linkStatus !== null,
                        linkStatus: result.linkStatus,
                      }
                    : currentItem,
                ),
          );
          setMessage(
            result.linkStatus === "published"
              ? "Запись добавлена в серию."
              : result.linkStatus === "submitted"
                ? "Связь отправлена на проверку."
                : "Связь удалена.",
          );
        }
      } catch {
        setMessage("Не удалось изменить связь. Возможно, сессия истекла.");
      } finally {
        setPendingId(null);
      }
    });
  }

  const normalizedQuery = query.trim();
  const hasResolvedCurrentQuery =
    normalizedQuery.length >= 2 && resolvedQuery === normalizedQuery;
  const visibleItems = hasResolvedCurrentQuery ? items : [];
  const searchPending = normalizedQuery.length >= 2 && !hasResolvedCurrentQuery;
  const dropdownOpen = open && normalizedQuery.length >= 2;

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(updateScrollShadow);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [dropdownOpen, loading, message, searchError, updateScrollShadow, visibleItems.length]);

  return (
    <div ref={rootRef} className="relative mt-4 w-0 min-w-full border-t border-dashed border-stone-300 pt-4">
      <label className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-700" htmlFor="series-media-search">
        Добавить запись
      </label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <input
          className="h-10 w-full rounded-md border border-stone-300/80 bg-stone-50/70 py-2 pl-9 pr-3 font-mono text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-950"
          aria-controls="series-media-search-results"
          id="series-media-search"
          onChange={(event) => {
          const nextQuery = event.target.value;
          const normalizedNextQuery = nextQuery.trim();

          queryRef.current = nextQuery;
          setQuery(nextQuery);
          setMessage(null);
          setOpen(normalizedNextQuery.length >= 2);

          if (normalizedNextQuery.length < 2) {
            setItems([]);
            setLoading(false);
            setResolvedQuery("");
            setSearchError(null);
          }
          }}
          onFocus={() => {
            if (normalizedQuery.length >= 2) {
              setOpen(true);
            }
          }}
          placeholder="Начните вводить название"
          type="search"
          value={query}
        />
      </div>
      {dropdownOpen ? (
        <div
          aria-label="Результаты поиска записей"
          className="absolute left-0 right-0 top-full z-[80] mt-1 min-w-0 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
          id="series-media-search-results"
          role="region"
        >
          <div
            ref={scrollAreaRef}
            className="max-h-[min(18rem,calc(100vh-8rem))] min-w-0 overflow-x-hidden overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={updateScrollShadow}
          >
          {message ? <p className="px-3 py-2 text-xs text-stone-600" role="status">{message}</p> : null}
          {loading || searchPending ? <p className="px-3 py-3 text-sm text-stone-500">Ищем записи…</p> : null}
          {hasResolvedCurrentQuery && searchError ? (
            <p className="px-3 py-3 text-sm text-red-700" role="alert">{searchError}</p>
          ) : null}
          {hasResolvedCurrentQuery && !searchError && !message && visibleItems.length === 0 ? (
            <p className="px-3 py-3 text-sm text-stone-500">Ничего не найдено.</p>
          ) : null}
          {visibleItems.length > 0 ? (
            <ul className="min-w-0 divide-y divide-stone-200 overflow-hidden">
              {visibleItems.map((item) => {
                const pending = pendingId === item.id;
                const canAdd = item.linkStatus === null;
                const disabled = pendingId !== null || (!canAdd && !item.canRemove);
                const actionLabel = canAdd
                  ? `Добавить ${item.title} в серию`
                  : item.canRemove
                    ? `Убрать ${item.title} из серии`
                    : "Связь уже предложена";

                return (
                  <li key={item.id} className="flex min-w-0 items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-lg leading-tight text-stone-950">
                        {item.title}
                      </p>
                      {item.originalTitle && item.originalTitle !== item.title ? (
                        <p className="mt-0.5 truncate text-xs text-stone-500">
                          {item.originalTitle}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-stone-500">
                        {getMediaTypeLabel(item.mediaType, mediaTypes)}
                        {item.releaseYear ? ` · ${item.releaseYear}` : ""}
                        {!canAdd && !item.canRemove ? ` · ${actionLabel}` : ""}
                      </p>
                    </div>
                    <button
                      aria-label={actionLabel}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-stone-300 text-stone-700 disabled:bg-stone-100 disabled:text-stone-400"
                      disabled={disabled}
                      onClick={() => mutateLink(item)}
                      title={actionLabel}
                      type="button"
                    >
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : item.canRemove ? (
                        <Minus className="size-4" />
                      ) : canAdd ? (
                        <Plus className="size-4" />
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          </div>
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-stone-950/12 to-transparent transition-opacity",
              scrollShadow.top ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-stone-950/12 to-transparent transition-opacity",
              scrollShadow.bottom ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
