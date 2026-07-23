"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/common/utils";
import type { SignedMediaTitleCandidate } from "@/lib/covers/types";

const TITLE_SEARCH_DELAY_MS = 500;
const MIN_TITLE_SEARCH_LENGTH = 2;

type MediaTitleCandidatesResponse = {
  candidates?: SignedMediaTitleCandidate[];
  error?: "author-rate-limit" | "rate-limit-unavailable";
};

type MediaTitleCandidatePickerProps = {
  disabled?: boolean;
  mediaType: string;
  onSelect: (candidate: SignedMediaTitleCandidate) => void;
  query: string;
};

function getCandidateMeta(candidate: SignedMediaTitleCandidate) {
  return [
    candidate.releaseYear ? String(candidate.releaseYear) : null,
    candidate.provider,
  ]
    .filter(Boolean)
    .join(" · ");
}

function hasTitleSearchInput(input: { mediaType: string; query: string }) {
  return (
    input.mediaType.trim().length > 0 &&
    input.query.trim().length >= MIN_TITLE_SEARCH_LENGTH
  );
}

export function MediaTitleCandidatePicker({
  disabled = false,
  mediaType,
  onSelect,
  query,
}: MediaTitleCandidatePickerProps) {
  const [candidates, setCandidates] = useState<SignedMediaTitleCandidate[]>([]);
  const [candidateSearchKey, setCandidateSearchKey] = useState("");
  const [suppressedSearchKey, setSuppressedSearchKey] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "empty" | "error" | "limited" | "unavailable"
  >("idle");
  const searchInput = useMemo(
    () => ({
      mediaType,
      query: query.trim(),
    }),
    [mediaType, query],
  );
  const searchKey = useMemo(() => JSON.stringify(searchInput), [searchInput]);
  const canSearch = !disabled && hasTitleSearchInput(searchInput);
  const shouldSuppressSearch = suppressedSearchKey === searchKey;
  const visibleCandidates =
    canSearch && !shouldSuppressSearch && candidateSearchKey === searchKey
      ? candidates
      : [];
  const isPreparingSearch =
    canSearch &&
    !shouldSuppressSearch &&
    candidateSearchKey !== searchKey &&
    status !== "loading";
  const isSearching = status === "loading" || isPreparingSearch;

  useEffect(() => {
    if (!canSearch || shouldSuppressSearch) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setStatus("loading");

      void fetch("/api/media-title-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchInput),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as MediaTitleCandidatesResponse;

          if (!isActive) {
            return;
          }

          if (response.status === 429 || data.error === "author-rate-limit") {
            setCandidates([]);
            setCandidateSearchKey(searchKey);
            setStatus("limited");
            return;
          }

          if (response.status === 503 || data.error === "rate-limit-unavailable") {
            setCandidates([]);
            setCandidateSearchKey(searchKey);
            setStatus("unavailable");
            return;
          }

          if (!response.ok) {
            setCandidates([]);
            setCandidateSearchKey("");
            setStatus("error");
            return;
          }

          const nextCandidates = data.candidates ?? [];

          setCandidates(nextCandidates);
          setCandidateSearchKey(searchKey);
          setStatus(nextCandidates.length > 0 ? "idle" : "empty");
        })
        .catch((error: unknown) => {
          if (!isActive || (error instanceof DOMException && error.name === "AbortError")) {
            return;
          }

          setCandidates([]);
          setCandidateSearchKey("");
          setStatus("error");
        });
    }, TITLE_SEARCH_DELAY_MS);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [canSearch, searchInput, searchKey, shouldSuppressSearch]);

  if (!canSearch) {
    return null;
  }

  return (
    <div className="relative">
      {visibleCandidates.length > 0 ? (
        <div className="absolute left-0 right-0 top-2 z-20 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {visibleCandidates.map((candidate) => (
              <button
                key={`${candidate.provider}:${candidate.id}`}
                type="button"
                className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-sm p-2 text-left transition-colors hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none"
                onClick={() => {
                  setSuppressedSearchKey(
                    JSON.stringify({
                      mediaType,
                      query: candidate.title.trim(),
                    }),
                  );
                  setCandidates([]);
                  setCandidateSearchKey("");
                  setStatus("idle");
                  onSelect(candidate);
                }}
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-stone-100 text-xs font-medium uppercase text-stone-400">
                  {candidate.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={candidate.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    candidate.provider.slice(0, 2)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-stone-950">
                    {candidate.title}
                  </span>
                  {candidate.originalTitle ? (
                    <span className="block truncate text-xs text-stone-500">
                      {candidate.originalTitle}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-stone-500">
                    {getCandidateMeta(candidate)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isSearching ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 overflow-hidden rounded-md border border-amber-300 bg-amber-50 text-amber-950 shadow-sm"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500 text-white shadow-[0_0_18px_rgba(245,158,11,0.45)]">
              <Search className="size-4 animate-pulse" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                Ищем тайтлы
              </span>
              <span className="block truncate text-xs text-amber-800">
                Проверяем провайдеров по названию
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden bg-amber-200">
            <div className="title-search-progress h-full w-2/5 rounded-r-full bg-amber-600 shadow-[0_0_14px_rgba(217,119,6,0.65)]" />
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "mt-2 text-xs text-stone-500",
            status === "idle" && "sr-only",
          )}
        >
          {status === "empty" ? "Подходящие тайтлы не найдены." : null}
          {status === "error" ? "Не удалось получить варианты тайтла." : null}
          {status === "limited" ? "Лимит поиска исчерпан, попробуйте позже." : null}
          {status === "unavailable" ? "Поиск временно недоступен." : null}
        </p>
      )}
    </div>
  );
}
