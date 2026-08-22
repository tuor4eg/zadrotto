"use client";

import { Fragment } from "react";
import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title";
import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { MediaItemFranchiseSuggestionDialog } from "@/app/media-item-franchise-suggestion-dialog";
import { ArchiveCover } from "@/app/media-item-tile";
import { ArchiveRatingPanel } from "@/app/media-rating-panel";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { CoverSourceAttribution } from "@/components/archive/cover-source-attribution";
import { MediaItemFranchiseLinks } from "@/components/archive/media-item-franchise-links";
import { buttonVariants } from "@/components/ui/button";
import { ImageViewer } from "@/components/ui/image-viewer";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { cn } from "@/lib/common/utils";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { mapFranchiseSuggestionOptions } from "@/lib/media/franchise-suggestion-options";
import { formatAuthorsFact, getDateFactYear } from "@/lib/media/metadata-facts";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";
import { isQuizMediaTypeAllowed } from "@/lib/quizzes/model";
import { QuizGuessButton } from "@/components/quizzes/quiz-guess-button";
import type { ActiveQuizContext } from "@/lib/quizzes/model";

type MediaCatalogPreviewProps = {
  canPublishFranchisesWithoutReview: boolean;
  canSuggestFranchises: boolean;
  currentAdmin: boolean;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  franchises: SearchableFranchiseOption[];
  item: CatalogMediaItem | null;
  mediaTypes: MediaTypeOption[];
  activeQuiz: ActiveQuizContext | null;
};

export function MediaCatalogPreview({
  activeQuiz,
  canPublishFranchisesWithoutReview,
  canSuggestFranchises,
  currentAdmin,
  currentAuthor,
  franchises,
  item,
  mediaTypes,
}: MediaCatalogPreviewProps) {
  if (!item) {
    return (
      <div className="grid min-h-[420px] place-items-center p-6 text-sm text-stone-600">
        Ничего не найдено.
      </div>
    );
  }

  const mediaCarrierFrame = getMediaCarrierFrame(item);
  const hasCarrierFrame = mediaCarrierFrame !== null;
  const labelFontClassName = mediaCarrierFrame?.labelFontClassName ?? "font-mono";
  const displayFontClassName = mediaCarrierFrame?.displayFontClassName ?? "font-serif";
  const firstFranchiseCode = item.franchises[0]?.code ?? null;
  const yearLabel = item.releaseYear
    ? String(item.releaseYear)
    : item.mediaType === "roblox"
      ? getDateFactYear(item.metadataFacts, "createdAt")
      : null;
  const metaItems = [
    getMediaTypeLabel(item.mediaType, mediaTypes).toLowerCase(),
    yearLabel,
    formatAuthorsFact(item.metadataFacts),
  ].filter((value): value is string => Boolean(value));
  const franchiseAction = currentAuthor ? (
    <MediaItemFranchiseSuggestionDialog
      assignedFranchises={item.franchises}
      canPublishWithoutReview={canPublishFranchisesWithoutReview}
      canSuggestFranchises={canSuggestFranchises}
      franchises={mapFranchiseSuggestionOptions(franchises, item.franchiseLinkStatuses)}
      mediaItemCode={item.code}
      mediaItemId={item.id}
      triggerTooltipPortal
      triggerTooltipSide={item.franchises.length === 0 ? "right" : "left"}
      franchiseSuggestionInput={{
        title: item.title,
        originalTitle: item.originalTitle,
        aliases: item.aliases,
        description: item.description,
        mediaType: item.mediaType,
        mediaTypeLabel: getMediaTypeLabel(item.mediaType, mediaTypes),
        releaseYear: item.releaseYear,
        mediaCarrier: item.mediaCarrierName,
        metadata: item.metadataFacts ?? {},
      }}
    />
  ) : null;

  return (
    <div className="flex min-w-0 flex-1 p-3 sm:p-4">
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <div
          className={
            hasCarrierFrame
              ? "overflow-visible rounded-sm"
              : "mx-auto w-full max-w-[13rem] overflow-hidden rounded-sm border border-stone-400 bg-stone-950 p-1.5 shadow-xl shadow-stone-950/20"
          }
        >
          <div
            className={
              hasCarrierFrame
                ? `relative mx-auto ${
                    mediaCarrierFrame.compactViewportClassName ??
                    mediaCarrierFrame.viewportClassName ??
                    mediaCarrierFrame.aspectRatioClassName
                  } overflow-visible rounded-sm`
                : "relative aspect-[2/3] overflow-hidden rounded-sm bg-stone-800"
            }
          >
            {item.coverUrl ? (
              <ImageViewer
                src={item.coverUrl}
                alt={`Обложка: ${item.title}`}
                title={item.title}
                triggerClassName={`block h-full w-full cursor-zoom-in text-left ${
                  hasCarrierFrame ? "" : "media-image-lift-trigger"
                }`}
              >
                <ArchiveCover
                  carrierFrameSize="compact"
                  item={item}
                  className="h-full w-full"
                />
              </ImageViewer>
            ) : (
              <ArchiveCover
                carrierFrameSize="compact"
                item={item}
                className="h-full w-full"
              />
            )}
            {!item.coverUrl && !hasCarrierFrame ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
                <span className="rounded-sm bg-stone-50/60 px-3 py-2 text-center font-mono text-xs font-semibold uppercase tracking-[0.18em] text-stone-900/75 shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                  Нет изображения
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <CoverSourceAttribution
          provider={item.coverSourceProvider}
          pageUrl={item.coverSourcePageUrl}
        />

        <div className={`mt-3 ${displayFontClassName} text-2xl leading-tight text-stone-950`}>
          <MediaCarrierDisplayTitle
            title={item.title}
            frame={mediaCarrierFrame}
          />
        </div>
        {item.originalTitle && item.originalTitle !== item.title ? (
          <div className={`mt-2 ${labelFontClassName} text-xs uppercase leading-5 text-stone-600`}>
            {item.originalTitle}
          </div>
        ) : null}

        <div className={`mt-3 min-w-0 ${labelFontClassName} text-xs leading-5 text-stone-800`}>
          {metaItems.map((metaItem, index) => (
            <Fragment key={`${metaItem}-${index}`}>
              {index > 0 ? <span className="mx-1.5">•</span> : null}
              <span className="break-words">{metaItem}</span>
            </Fragment>
          ))}
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <Link
              href={`/media/${item.code}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "min-w-0 flex-1 px-3 hover:border-stone-700 hover:bg-stone-50 hover:text-stone-700",
              )}
            >
              <FolderOpen />
              Открыть досье
            </Link>
          </div>
          {currentAuthor && item.currentAuthorScore === null ? (
            <AuthorMediaStatusControls
              className="mt-0"
              currentAuthorScore={item.currentAuthorScore}
              currentAuthorStatus={item.currentAuthorStatus}
              mediaItemCode={item.code}
              variant="preview"
            />
          ) : null}
          {activeQuiz && isQuizMediaTypeAllowed(activeQuiz.mediaTypes, item.mediaType) ? (
            <QuizGuessButton titleId={item.id} variant="preview" />
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-stone-300 pt-3">
          <ArchiveRatingPanel
            compact
            displayFontClassName={displayFontClassName}
            label="Оценка архива"
            labelFontClassName={labelFontClassName}
            ratingPanelVariant={mediaCarrierFrame?.ratingPanelVariant}
            ratingsCount={item.ratingsCount}
            score={item.averageScore}
          />
          <MediaItemRatingDialog
            mediaItemCode={item.code}
            franchiseCode={firstFranchiseCode}
            title={item.title}
            currentAuthor={currentAuthor}
            currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
            currentAuthorFirstExperiencedPrecision={
              item.currentAuthorFirstExperiencedPrecision
            }
            currentAuthorScore={item.currentAuthorScore}
            releaseYear={item.releaseYear}
            panelDisplayClassName={displayFontClassName}
            panelLabelClassName={labelFontClassName}
            panelVariant={mediaCarrierFrame?.ratingPanelVariant}
            size="compact"
          />
        </div>
        <div className="mt-4 border-t border-dashed border-stone-300 pt-3 text-sm leading-6 text-stone-800">
          <div className="flex items-center gap-2">
            <div className={`${labelFontClassName} text-[10px] font-semibold uppercase leading-5 text-stone-500`}>
              Серии
            </div>
            {item.franchises.length === 0 ? franchiseAction : null}
          </div>
          {item.franchises.length > 0 ? (
            <MediaItemFranchiseLinks
              franchises={item.franchises}
              containerClassName="mt-1 flex flex-wrap items-center gap-1.5"
              className="rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors hover:bg-[var(--archive-bg-start)] hover:text-white"
              trailingAction={franchiseAction}
            />
          ) : !currentAuthor ? (
            <div className="mt-1 text-stone-500">Не указаны</div>
          ) : null}
        </div>

        {currentAdmin ? (
          <div className="mt-auto flex justify-end pt-4">
            <AdminEntityEditLink
              ariaLabel={`Редактировать запись ${item.title}`}
              href={`/admin/media/${item.id}/edit`}
              tooltipLabel="Редактировать запись"
              tooltipSide="left"
            />
          </div>
        ) : null}

      </div>
    </div>
  );
}
