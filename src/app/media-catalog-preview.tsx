"use client";

import Link from "next/link";
import {
  ArrowRight,
  FolderOpen,
} from "lucide-react";

import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title";
import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { MediaItemFranchiseSuggestionDialog } from "@/app/media-item-franchise-suggestion-dialog";
import { ArchiveCover } from "@/app/media-item-tile";
import { ArchiveRatingPanel } from "@/app/media-rating-panel";
import { AdminEntityEditLink } from "@/components/archive/admin-entity-edit-link";
import { MediaItemFranchiseLinks } from "@/components/archive/media-item-franchise-links";
import { ImageViewer } from "@/components/ui/image-viewer";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import type { CatalogMediaItem } from "@/db/queries/media-items";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import { mapFranchiseSuggestionOptions } from "@/lib/media/franchise-suggestion-options";
import { formatAuthorsFact } from "@/lib/media/metadata-facts";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";

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
};

function CoverSourceAttribution({
  provider,
  pageUrl,
}: {
  provider?: string | null;
  pageUrl?: string | null;
}) {
  if (provider !== "rawg" || !pageUrl) {
    return null;
  }

  return (
    <a
      href={pageUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex text-xs text-stone-600 underline decoration-stone-400 underline-offset-4 transition-colors hover:text-stone-950"
    >
      Обложка: RAWG
    </a>
  );
}

export function MediaCatalogPreview({
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
  const metaItems = [
    getMediaTypeLabel(item.mediaType, mediaTypes).toLowerCase(),
    item.releaseYear ? String(item.releaseYear) : null,
    formatAuthorsFact(item.metadataFacts),
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="flex flex-1 p-3 sm:p-4">
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className={`${labelFontClassName} text-sm uppercase leading-6 text-stone-950`}>
          Досье
        </div>

        <div
          className={
            hasCarrierFrame
              ? "mt-3 overflow-visible rounded-sm"
              : "mt-3 mx-auto w-full max-w-[13rem] overflow-hidden rounded-sm border border-stone-400 bg-stone-950 p-1.5 shadow-xl shadow-stone-950/20"
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
        {currentAuthor && item.currentAuthorScore === null ? (
          <AuthorMediaStatusControls
            currentAuthorScore={item.currentAuthorScore}
            currentAuthorStatus={item.currentAuthorStatus}
            mediaItemCode={item.code}
          />
        ) : null}
        {item.originalTitle && item.originalTitle !== item.title ? (
          <div className={`mt-2 ${labelFontClassName} text-xs uppercase leading-5 text-stone-600`}>
            {item.originalTitle}
          </div>
        ) : null}

        <div className={`mt-3 flex flex-wrap gap-x-2 gap-y-1 ${labelFontClassName} text-xs leading-5 text-stone-800`}>
          {metaItems.map((metaItem, index) => (
            <span key={`${metaItem}-${index}`} className="inline-flex min-w-0 items-center gap-2">
              {index > 0 ? <span aria-hidden="true">•</span> : null}
              <span className="min-w-0 truncate">{metaItem}</span>
            </span>
          ))}
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
          <div className="flex items-center justify-between gap-3">
            <div className={`${labelFontClassName} text-[10px] font-semibold uppercase leading-5 text-stone-500`}>
              Серии
            </div>
            {currentAuthor ? (
              <MediaItemFranchiseSuggestionDialog
                assignedFranchises={item.franchises}
                canPublishWithoutReview={canPublishFranchisesWithoutReview}
                canSuggestFranchises={canSuggestFranchises}
                franchises={mapFranchiseSuggestionOptions(
                  franchises,
                  item.franchiseLinkStatuses,
                )}
                mediaItemCode={item.code}
                mediaItemId={item.id}
                triggerTooltipSide="left"
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
            ) : null}
          </div>
          {item.franchises.length > 0 ? (
            <MediaItemFranchiseLinks
              franchises={item.franchises}
              containerClassName="mt-1 flex flex-wrap gap-x-2 gap-y-1"
              className="font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
            />
          ) : (
            <div className="mt-1 text-stone-500">Не указаны</div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Link
            href={`/media/${item.code}`}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-3 rounded-md border border-stone-400 bg-stone-50/65 px-4 py-3 font-mono text-sm text-stone-950 transition-colors hover:border-stone-950 hover:bg-stone-100"
          >
            <FolderOpen className="size-5" />
            Открыть досье
            <ArrowRight className="size-5" />
          </Link>
          {currentAdmin ? (
            <AdminEntityEditLink
              ariaLabel={`Редактировать запись ${item.title}`}
              href={`/admin/media/${item.id}/edit`}
              tooltipLabel="Редактировать запись"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
