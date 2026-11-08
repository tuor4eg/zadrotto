"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  MediaItemForm,
  type MediaItemFormAction,
} from "@/app/author/(protected)/media/media-item-form";
import { ARCHIVE_AUTHOR_MEDIA_SUGGEST_EVENT } from "@/lib/media/suggestion-events";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaType } from "@/lib/media/types";
import type { MediaTypeFilter } from "./media-items-catalog-logic";

type ArchiveAuthorMediaSuggestionProps = {
  action: MediaItemFormAction;
  canCreateFranchise: boolean;
  canPublishMediaWithoutReview: boolean;
  canSuggestFranchises: boolean;
  defaultFranchiseIds?: number[];
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypes: Awaited<ReturnType<typeof getMediaTypeOptions>>;
  searchQuery: string;
  maxTitleAliases: number;
};

type SuggestionModalState = {
  mediaType: MediaType;
  title: string;
};


function getCurrentArchivePath(pathname: string, searchParams: URLSearchParams) {
  const nextSearchParams = new URLSearchParams(searchParams.toString());

  nextSearchParams.delete("add");
  nextSearchParams.delete("suggested");
  nextSearchParams.delete("suggestedItemCode");
  nextSearchParams.delete("suggestedItemId");
  nextSearchParams.delete("suggestionError");

  const queryString = nextSearchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function appendParam(path: string, key: string, value: string) {
  const [pathname, search = ""] = path.split("?", 2);
  const searchParams = new URLSearchParams(search);

  searchParams.set(key, value);

  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function ArchiveAuthorMediaSuggestion({
  action,
  canCreateFranchise,
  canPublishMediaWithoutReview,
  canSuggestFranchises,
  defaultFranchiseIds = [],
  franchises,
  mediaCarriers,
  mediaTypeFilter,
  mediaTypes,
  searchQuery,
  maxTitleAliases,
}: ArchiveAuthorMediaSuggestionProps) {
  const pathname = usePathname();
  const router = useRouter();
  const openedFromLink = useRef(false);
  const searchParams = useSearchParams();
  const [modalState, setModalState] = useState<SuggestionModalState | null>(null);
  const defaultMediaType = mediaTypes[0]?.code ?? null;
  const selectedMediaType =
    mediaTypeFilter !== "all" && mediaTypes.some(({ code }) => code === mediaTypeFilter)
      ? mediaTypeFilter
      : defaultMediaType;
  const currentArchivePath = useMemo(
    () => getCurrentArchivePath(pathname, searchParams),
    [pathname, searchParams],
  );
  const successRedirectTo = useMemo(
    () => appendParam(currentArchivePath, "suggested", "created"),
    [currentArchivePath],
  );
  const submittedSuccessRedirectTo = useMemo(
    () => appendParam(currentArchivePath, "suggested", "submitted"),
    [currentArchivePath],
  );
  const publishedSuccessRedirectTo = useMemo(
    () => appendParam(currentArchivePath, "suggested", "published"),
    [currentArchivePath],
  );
  const createAndSubmitLabel = canPublishMediaWithoutReview
    ? "Опубликовать"
    : "Отправить на модерацию";

  const openModal = useCallback((requestedMediaType: MediaTypeFilter | null = selectedMediaType) => {
    const mediaType = mediaTypes.some(({ code }) => code === requestedMediaType)
      ? (requestedMediaType as MediaType)
      : selectedMediaType;

    if (!mediaType) {
      return;
    }

    setModalState({
      mediaType,
      title: searchQuery,
    });
  }, [mediaTypes, searchQuery, selectedMediaType]);

  useEffect(() => {
    if (searchParams.get("add") !== "1" || openedFromLink.current || !selectedMediaType) return;
    openedFromLink.current = true;
    openModal();
    router.replace(currentArchivePath, { scroll: false });
  }, [searchParams, selectedMediaType, openModal, router, currentArchivePath]);

  useEffect(() => {
    function handleSuggestRequest(event: Event) {
      const mediaType = (event as CustomEvent<{ mediaType?: MediaTypeFilter }>).detail?.mediaType;
      openModal(mediaType ?? selectedMediaType);
    }

    window.addEventListener(ARCHIVE_AUTHOR_MEDIA_SUGGEST_EVENT, handleSuggestRequest);

    return () => {
      window.removeEventListener(ARCHIVE_AUTHOR_MEDIA_SUGGEST_EVENT, handleSuggestRequest);
    };
  }, [openModal, selectedMediaType]);

  useEffect(() => {
    if (!modalState) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalState(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalState]);

  return (
    <>
      {modalState
        ? createPortal(
            <div
              aria-labelledby="archive-author-media-suggestion-title"
              aria-modal="true"
              className="fixed inset-0 z-[80] flex min-h-0 justify-center overflow-hidden bg-stone-950/45 px-3 py-5 sm:items-center sm:px-5"
              role="dialog"
            >
              <div className="archive-paper archive-panel my-auto flex h-full max-h-[calc(100dvh-2.5rem)] w-full max-w-3xl flex-col shadow-2xl">
                <div className="shrink-0 p-4 pb-3 sm:p-5 sm:pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        id="archive-author-media-suggestion-title"
                        className="media-carrier-font-pc-steam text-2xl leading-none text-stone-950"
                      >
                        Предложить запись
                      </div>
                    </div>
                    <button
                      type="button"
                      className="grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
                      aria-label="Закрыть форму предложения"
                      onClick={() => setModalState(null)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="archive-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
                  <MediaItemForm
                    key={`${modalState.mediaType}:${modalState.title}`}
                    action={action}
                    cancelHref={currentArchivePath}
                    canCreateFranchise={canCreateFranchise}
                    canSuggestFranchises={canSuggestFranchises}
                    createAndSubmitLabel={createAndSubmitLabel}
                    errorParamName="suggestionError"
                    errorRedirectTo={currentArchivePath}
                    franchises={franchises}
                    mediaCarriers={mediaCarriers}
                    mediaTypes={mediaTypes}
                    maxTitleAliases={maxTitleAliases}
                    titleAliasTooltipSide="left"
                    onCancel={() => setModalState(null)}
                    publishedSuccessRedirectTo={publishedSuccessRedirectTo}
                    submitLabel="Сохранить черновик"
                    submittedSuccessRedirectTo={submittedSuccessRedirectTo}
                    successRedirectTo={successRedirectTo}
                    values={{
                      franchiseIds: defaultFranchiseIds,
                      mediaType: modalState.mediaType,
                      title: modalState.title,
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
