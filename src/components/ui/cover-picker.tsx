"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { CoverPreview } from "@/app/author/(protected)/media/cover-preview";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/common/utils";
import { COVER_IMAGE_TYPES, DEFAULT_COVER_MAX_BYTES } from "@/lib/covers/config";
import {
  COVER_REQUEST_ERROR_MESSAGES,
  isCoverRequestError,
  type CoverRequestError,
} from "@/lib/covers/provider-errors";
import type { MediaTitleCandidate, SignedCoverCandidate } from "@/lib/covers/types";

const EMPTY_FILE_LABEL = "Файл не выбран";
const CURRENT_FILE_LABEL = "Текущая обложка";
const AUTO_COVER_SEARCH_DELAY_MS = 700;

type CoverPickerValues = {
  title: string;
  originalTitle: string;
  mediaType: string;
  releaseYear: string;
  titleSource?: Pick<MediaTitleCandidate, "provider" | "externalId"> | null;
};

type CoverSearchValues = Pick<CoverPickerValues, "title" | "originalTitle" | "mediaType" | "releaseYear" | "titleSource">;

type CoverPickerProps = {
  canSearchCandidates?: boolean;
  inputId: string;
  initialPreviewUrl?: string | null;
  maxFileBytes?: number;
  onFileRejected?: (error: "cover-too-large" | "cover-type") => void;
  values: CoverPickerValues;
  thumbnailClassName?: string;
};

type CoverCandidatesResponse = {
  candidates?: SignedCoverCandidate[];
  error?:
    | "author-rate-limit"
    | "provider-daily-limit"
    | "provider-unavailable"
    | "rate-limit-unavailable";
};

function hasCoverSearchInput(values: CoverSearchValues) {
  return Boolean((values.originalTitle || values.title).trim() && values.mediaType.trim());
}

export function CoverPicker({
  canSearchCandidates = true,
  inputId,
  initialPreviewUrl,
  maxFileBytes = DEFAULT_COVER_MAX_BYTES,
  onFileRejected,
  values,
  thumbnailClassName = "h-28 w-20 rounded object-cover",
}: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(
    initialPreviewUrl ? CURRENT_FILE_LABEL : EMPTY_FILE_LABEL,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl ?? null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isCoverRemoved, setIsCoverRemoved] = useState(false);
  const [selectedCandidateToken, setSelectedCandidateToken] = useState("");
  const [candidates, setCandidates] = useState<SignedCoverCandidate[]>([]);
  const [candidatesSearchKey, setCandidatesSearchKey] = useState("");
  const [searchError, setSearchError] = useState<{
    code: CoverRequestError;
    searchKey: string;
  } | null>(null);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "loading" | "empty" | "error" | "limited" | "unavailable"
  >("idle");
  const [isPending, startTransition] = useTransition();
  const coverSearchValues = useMemo(
    () => ({
      title: values.title,
      originalTitle: values.originalTitle,
      mediaType: values.mediaType,
      releaseYear: values.releaseYear,
      titleSource: values.titleSource ?? null,
    }),
    [values.mediaType, values.originalTitle, values.releaseYear, values.title, values.titleSource],
  );
  const coverSearchKey = useMemo(
    () => JSON.stringify(coverSearchValues),
    [coverSearchValues],
  );
  const hasSearchInput = hasCoverSearchInput(coverSearchValues);
  const shouldSearch = canSearchCandidates && !previewUrl && hasSearchInput;
  const visibleSearchError =
    shouldSearch && searchError?.searchKey === coverSearchKey ? searchError : null;
  const isSearching = searchStatus === "loading" || isPending;
  const visibleCandidates =
    canSearchCandidates && hasSearchInput && candidatesSearchKey === coverSearchKey
      ? candidates
      : [];
  const hasVisibleGoogleBooksCandidates = visibleCandidates.some(
    (candidate) => candidate.provider === "google-books",
  );
  const isSupportedFileType = (file: File) =>
    COVER_IMAGE_TYPES.some((type) => type === file.type);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const fetchCandidates = async () => {
    const response = await fetch("/api/cover-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coverSearchValues),
    });

    const data = (await response.json()) as CoverCandidatesResponse;

    if (isCoverRequestError(data.error)) {
      return { candidates: [], error: data.error };
    }

    if (!response.ok) {
      return null;
    }

    return { candidates: data.candidates ?? [], error: null };
  };

  const searchCandidates = () => {
    if (!canSearchCandidates || !hasSearchInput) {
      setCandidates([]);
      setSearchError(null);
      setSearchStatus("idle");
      return;
    }

    startTransition(async () => {
      setSearchStatus("loading");
      setSearchError(null);

      try {
        const result = await fetchCandidates();

        if (!result) {
          setCandidates([]);
          setSearchStatus("error");
          return;
        }

        setCandidates(result.candidates);
        setCandidatesSearchKey(coverSearchKey);
        setSearchError(result.error ? { code: result.error, searchKey: coverSearchKey } : null);
        setSearchStatus(result.error ? "unavailable" : result.candidates.length > 0 ? "idle" : "empty");
      } catch {
        setCandidates([]);
        setCandidatesSearchKey("");
        setSearchStatus("error");
      }
    });
  };

  useEffect(() => {
    if (shouldSearch) {
      let isActive = true;
      const timeoutId = window.setTimeout(() => {
        setSearchStatus("loading");

        void fetchCandidates()
          .then((result) => {
            if (!isActive || !result) {
              return;
            }

            setCandidates(result.candidates);
            setCandidatesSearchKey(coverSearchKey);
            setSearchError(result.error ? { code: result.error, searchKey: coverSearchKey } : null);
            setSearchStatus(result.error ? "unavailable" : result.candidates.length > 0 ? "idle" : "empty");
          })
          .catch(() => {
            if (isActive) {
              setCandidates([]);
              setCandidatesSearchKey("");
              setSearchStatus("error");
            }
          });
      }, AUTO_COVER_SEARCH_DELAY_MS);

      return () => {
        isActive = false;
        window.clearTimeout(timeoutId);
      };
    }

    // searchCandidates intentionally captures the latest form values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverSearchKey, shouldSearch]);

  return (
    <>
      <ArchiveToasts
        key={`cover-search-toasts-${coverSearchKey}-${shouldSearch}`}
        messages={visibleSearchError ? [{
          id: `cover-search-${visibleSearchError.code}-${coverSearchKey}`,
          tone: "error",
          text: COVER_REQUEST_ERROR_MESSAGES[visibleSearchError.code],
        } satisfies ArchiveToast] : []}
      />
      <input
        type="hidden"
        name="coverAction"
        value={isCoverRemoved && !selectedCandidateToken ? "remove" : "keep"}
      />
      <input type="hidden" name="coverCandidateToken" value={selectedCandidateToken} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          name="coverFile"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;

            if (file && !isSupportedFileType(file)) {
              event.currentTarget.value = "";
              onFileRejected?.("cover-type");
              return;
            }

            if (file && file.size > maxFileBytes) {
              event.currentTarget.value = "";
              onFileRejected?.("cover-too-large");
              return;
            }

            const nextPreviewUrl = file ? URL.createObjectURL(file) : null;

            setIsCoverRemoved(false);
            setSelectedCandidateToken("");
            setFileName(file?.name ?? (initialPreviewUrl ? CURRENT_FILE_LABEL : EMPTY_FILE_LABEL));
            setLocalPreviewUrl(nextPreviewUrl);
            setPreviewUrl(nextPreviewUrl ?? initialPreviewUrl ?? null);
          }}
        />
        <label htmlFor={inputId} className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}>
          Выбрать файл
        </label>
        {previewUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.value = "";
              }

              setIsCoverRemoved(true);
              setSelectedCandidateToken("");
              setFileName(EMPTY_FILE_LABEL);
              setLocalPreviewUrl(null);
              setPreviewUrl(null);
            }}
          >
            Удалить обложку
          </Button>
        ) : null}
        {!previewUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={searchCandidates}
            disabled={!canSearchCandidates || !hasSearchInput || isSearching}
            title={isSearching ? "Идет поиск..." : "Обновить варианты"}
          >
            <RefreshCw className={cn("size-4", isSearching ? "animate-spin" : "")} />
            {isSearching ? "Идет поиск..." : "Обновить варианты"}
          </Button>
        ) : null}
        <span className="min-w-0 truncate text-sm text-stone-500">{fileName}</span>
      </div>

      {previewUrl ? (
        <CoverPreview
          src={previewUrl}
          alt="Обложка"
          buttonClassName="mt-3 block w-fit rounded-md border border-stone-200 bg-white p-1 text-left transition-colors hover:border-stone-400"
          thumbnailClassName={thumbnailClassName}
        />
      ) : null}

      {!previewUrl ? (
        <div className="mt-3 grid gap-3">
          {visibleCandidates.length > 0 ? (
            <div className="grid gap-3">
              {hasVisibleGoogleBooksCandidates ? (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://books.google.com/googlebooks/images/poweredby.png"
                    alt="Powered by Google"
                    className="h-auto w-[62px]"
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {visibleCandidates.map((candidate) => {
                  const isSelected = selectedCandidateToken === candidate.token;

                  return (
                    <div
                      key={`${candidate.provider}:${candidate.id}`}
                      className={cn(
                        "rounded-md border bg-white p-2 transition-colors",
                        isSelected ? "border-stone-950" : "border-stone-200",
                      )}
                    >
                      <CoverPreview
                        src={candidate.imageUrl}
                        alt={candidate.title}
                        buttonClassName="block w-full overflow-hidden rounded bg-stone-100 text-left transition-opacity hover:opacity-90"
                        thumbnailClassName="aspect-square w-full object-cover"
                      />
                      <span className="mt-2 block truncate text-xs font-medium text-stone-900">
                        {candidate.title}
                      </span>
                      <span className="block text-xs text-stone-500">
                        {candidate.year ? `${candidate.provider}, ${candidate.year}` : candidate.provider}
                      </span>
                      {candidate.provider === "google-books" ? (
                        <a
                          href={candidate.sourcePageUrl ?? `https://books.google.com/books?id=${encodeURIComponent(candidate.id.replace(/^volume:/, ""))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-950"
                        >
                          Google Books
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => {
                          setSearchError(null);
                          setSelectedCandidateToken(candidate.token);
                          setIsCoverRemoved(false);
                          setFileName(`Вариант: ${candidate.title}`);
                          setPreviewUrl(candidate.imageUrl);
                        }}
                      >
                        {isSelected ? "Выбрано" : "Выбрать"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {searchStatus === "loading" ? (
            <p className="text-xs text-stone-500">Ищу варианты обложки...</p>
          ) : null}
          {searchStatus === "empty" ? (
            <p className="text-xs text-stone-500">
              Варианты не нашлись. Можно загрузить файл вручную.
            </p>
          ) : null}
          {searchStatus === "error" ? (
            <p className="text-xs text-stone-500">
              Не удалось получить варианты. Ручная загрузка доступна.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
