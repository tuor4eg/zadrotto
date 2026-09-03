import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { ArchiveAuthorMediaSuggestion } from "@/app/archive-author-media-suggestion";
import { createAuthorMediaItemAction } from "@/app/author/(protected)/media/actions";
import { getAuthorMediaFormErrorMessage } from "@/app/author/(protected)/media/messages";
import { MediaItemTile } from "@/app/media-item-tile";
import { MediaItemStatusTile } from "@/app/media-item-status-tile";
import { ArchiveNote } from "@/components/archive/archive-note";
import { BugReportEntityContextRegistration } from "@/components/bug-reports/bug-report-entity-context";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import {
  getFranchiseByCode,
  getFranchiseOptions,
  getMediaItemsByFranchiseId,
  getPublishedFranchiseBranch,
} from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getPublishedMediaTypeCounts } from "@/db/queries/media-items";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { canAuthorCreateFranchise } from "@/lib/authors/media-publication";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { getMediaTypeLabel, sortMediaTypesByCount, type MediaType, type MediaTypeOption } from "@/lib/media/types";
import { formatMediaItemsCount } from "@/app/series/series-format";
import { SeriesMediaLinkSearch } from "./series-media-link-search";
import { SeriesMediaUnlinkTile } from "./series-media-unlink-tile";
import { getChildSeriesPreview, shouldShowAllChildSeries } from "./child-series";
import { SeriesPageHeader } from "./series-page-header";

export const dynamic = "force-dynamic";

type FranchisePageProps = {
  params: Promise<{
    code: string;
  }>;
  searchParams: Promise<{
    suggested?: string;
    suggestedItemCode?: string;
    suggestedItemId?: string;
    suggestionError?: string;
  }>;
};

type FranchiseMediaItem = Awaited<ReturnType<typeof getMediaItemsByFranchiseId>>[number];

type FranchiseMediaSection = {
  count: number;
  id: string;
  items: FranchiseMediaItem[];
  label: string;
  mediaType: MediaType;
};

function getFranchiseMediaSections(
  items: FranchiseMediaItem[],
  mediaTypes: MediaTypeOption[],
): FranchiseMediaSection[] {
  const itemsByMediaType = new Map<MediaType, FranchiseMediaItem[]>();

  for (const item of items) {
    itemsByMediaType.set(item.mediaType, [...(itemsByMediaType.get(item.mediaType) ?? []), item]);
  }

  return mediaTypes
    .map((mediaType) => {
      const sectionItems = itemsByMediaType.get(mediaType.code) ?? [];

      return {
        count: sectionItems.length,
        id: `section-${mediaType.code}`,
        items: sectionItems,
        label: getMediaTypeLabel(mediaType.code, mediaTypes),
        mediaType: mediaType.code,
      };
    })
    .filter((section) => section.count > 0);
}

export async function generateMetadata({ params }: FranchisePageProps): Promise<Metadata> {
  const { code } = await params;
  const [franchise, currentAuthor] = await Promise.all([
    getFranchiseByCode(code),
    getCurrentAuthor(),
  ]);

  if (!franchise) {
    return {};
  }

  const enabledMediaTypeCodes = (
    await getEffectiveMediaTypeOptions(currentAuthor?.id)
  )
    .filter(({ isEnabled }) => isEnabled)
    .map(({ code: mediaTypeCode }) => mediaTypeCode);
  const items = await getMediaItemsByFranchiseId(
    franchise.id,
    enabledMediaTypeCodes,
    currentAuthor?.id,
  );
  const title = `${franchise.title} · ${formatMediaItemsCount(items.length)}`;

  return {
    title,
    openGraph: {
      type: "website",
      title,
    },
    twitter: {
      card: "summary",
      title,
    },
  };
}

export default async function FranchisePage({ params, searchParams }: FranchisePageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const franchise = await getFranchiseByCode(code);

  if (!franchise) {
    notFound();
  }

  const [currentAuthor, currentAdminUser, archiveSettings] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
    getArchiveSettings(),
  ]);
  const effectiveMediaTypes = await getEffectiveMediaTypeOptions(currentAuthor?.id);
  const mediaTypes = effectiveMediaTypes.filter(({ isEnabled }) => isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map(({ code }) => code);
  const [items, franchiseBranch, authorMediaSuggestionData] = await Promise.all([
    getMediaItemsByFranchiseId(franchise.id, enabledMediaTypeCodes, currentAuthor?.id),
    getPublishedFranchiseBranch(franchise.id, enabledMediaTypeCodes),
    currentAuthor
      ? Promise.all([
          getFranchiseOptions(currentAuthor.id),
          getMediaCarrierOptions(),
          isAiScenarioEnabled(AI_SCENARIO_KEYS.SUGGEST_SERIES),
          getPublishedMediaTypeCounts(),
        ]).then(
          ([franchises, mediaCarriers, canSuggestFranchises, mediaTypeCounts]) => ({
            canCreateFranchise: canAuthorCreateFranchise({
              canPublishFranchisesWithoutReview:
                currentAuthor.canPublishFranchisesWithoutReview,
            }),
            canPublishMediaWithoutReview: currentAuthor.canPublishMediaWithoutReview,
            canSuggestFranchises,
            franchises,
            mediaCarriers,
            mediaTypeCounts,
          }),
        )
      : Promise.resolve(null),
  ]);
  const sections = getFranchiseMediaSections(items, mediaTypes);
  const childSeries = franchiseBranch?.children ?? [];
  const childSeriesPreview = getChildSeriesPreview(childSeries);
  const showAllChildSeries = shouldShowAllChildSeries(childSeries.length);
  const suggestionErrorMessage = getAuthorMediaFormErrorMessage(query.suggestionError);
  const suggestedItemId = Number(query.suggestedItemId);
  const suggestedItemHref =
    Number.isInteger(suggestedItemId) && suggestedItemId > 0
      ? query.suggested === "published" && query.suggestedItemCode
        ? `/media/${encodeURIComponent(query.suggestedItemCode)}`
        : query.suggested === "created"
          ? `/author/media/${suggestedItemId}/edit`
          : query.suggested === "submitted" && query.suggestedItemCode
            ? `/author/media?q=${encodeURIComponent(query.suggestedItemCode)}`
            : null
      : null;
  const suggestionSuccessMessage =
    query.suggested === "created"
      ? "создана в черновиках."
      : query.suggested === "submitted"
        ? "создана и отправлена на проверку."
        : query.suggested === "published"
          ? "создана и опубликована."
          : null;
  const toastMessages = [
    ...(suggestionSuccessMessage
      ? [
          {
            id: "suggested",
            ...(suggestedItemHref
              ? { link: { href: suggestedItemHref, label: "Запись" } }
              : {}),
            tone: "success",
            text: suggestionSuccessMessage,
          } satisfies ArchiveToast,
        ]
      : []),
    ...(suggestionErrorMessage
      ? [
          {
            id: query.suggestionError ?? "suggestion-error",
            tone: "error",
            text: suggestionErrorMessage,
          } satisfies ArchiveToast,
        ]
      : []),
  ];

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <BugReportEntityContextRegistration context={{ entityId: String(franchise.id), entityType: "franchise" }} />
      <ArchiveToasts
        clearParams={[
          "suggested",
          "suggestedItemCode",
          "suggestedItemId",
          "suggestionError",
        ]}
        messages={toastMessages}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="archive-paper archive-panel archive-stack archive-stack-bottom relative z-10 min-w-0 overflow-visible pt-8">
          <SeriesPageHeader
            adminCanEdit={Boolean(currentAdminUser)}
            franchise={franchise}
            mediaItemsCount={items.length}
          >
            {currentAuthor ? (
              <SeriesMediaLinkSearch franchiseCode={franchise.code} mediaTypes={mediaTypes} />
            ) : null}
          </SeriesPageHeader>

          {franchise.description?.trim() ? (
            <div className="p-6 sm:p-8">
              <ArchiveNote text={franchise.description} maxWidthClassName="max-w-none" />
            </div>
          ) : null}

          {childSeries.length > 0 ? (
            <section className="border-t border-stone-300/80 px-6 py-6 sm:px-8" aria-labelledby="franchise-branch-heading">
              <h2 id="franchise-branch-heading" className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                Серии внутри
              </h2>
              <ul className="mt-3 flex min-w-0 max-w-full flex-wrap gap-1.5">
                {childSeriesPreview.map((child) => (
                  <li key={child.id} className="min-w-0 max-w-full">
                    <Link
                      href={`/series/${child.code}`}
                      className="inline-block max-w-full rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors [overflow-wrap:anywhere] hover:bg-[var(--archive-bg-start)] hover:text-white"
                    >
                      {child.title}
                    </Link>
                  </li>
                ))}
                {!showAllChildSeries ? (
                  <li className="min-w-0 max-w-full">
                    <Link
                      href={`/series/${franchise.code}/children`}
                      className="inline-block max-w-full px-2.5 py-1 font-mono text-xs font-semibold uppercase leading-5 tracking-[0.08em] text-red-900 underline decoration-red-900/40 underline-offset-4 transition-colors hover:text-stone-950"
                    >
                      Все {childSeries.length} серий →
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {items.length === 0 ? (
            <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8 sm:pt-4">
              <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
                В этой серии пока нет записей.
              </div>
            </div>
          ) : null}
          {sections.length > 0 ? (
            <div className="relative z-20 px-6 pb-7 pt-3 sm:px-8 sm:pb-8">
              <div className="flex flex-col gap-3">
                {sections.map((section) => (
                  <details
                    key={section.mediaType}
                    id={section.id}
                    className="group/section scroll-mt-5 rounded-sm border border-stone-300/70 bg-stone-50/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                    open
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 transition-colors hover:bg-stone-100/45 [&::-webkit-details-marker]:hidden">
                      <h2 className="min-w-0 truncate font-mono text-xs font-semibold uppercase tracking-[0.12em] text-stone-800">
                        {section.label}
                      </h2>
                      <span className="font-mono text-[11px] tabular-nums text-stone-500">
                        {section.count}
                      </span>
                      <span className="h-px min-w-6 flex-1 bg-stone-300/80" />
                      <ChevronDown className="size-4 shrink-0 text-stone-500 transition-transform group-open/section:rotate-180" />
                    </summary>

                    <div className="grid grid-cols-3 content-start gap-2.5 border-t border-stone-300/70 p-3 md:grid-cols-4 xl:grid-cols-6">
                      {section.items.map((item) => currentAuthor && item.hasDirectFranchiseLink ? (
                        <SeriesMediaUnlinkTile key={item.id} canPublishFranchisesWithoutReview={currentAuthor.canPublishFranchisesWithoutReview} franchiseCode={franchise.code} item={item} mediaTypes={mediaTypes} currentAuthorScore={item.currentAuthorScore} currentAuthorStatus={item.currentAuthorStatus} />
                      ) : currentAuthor ? (
                        <MediaItemStatusTile key={item.id} currentAuthorScore={item.currentAuthorScore} currentAuthorStatus={item.currentAuthorStatus} item={item} href={`/media/${item.code}`} mediaTypes={mediaTypes} />
                      ) : (
                        <MediaItemTile key={item.id} currentAuthorScore={currentAuthor ? item.currentAuthorScore : undefined} item={item} href={`/media/${item.code}`} mediaTypes={mediaTypes} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {currentAuthor && authorMediaSuggestionData ? (
        <ArchiveAuthorMediaSuggestion
          maxTitleAliases={archiveSettings.maxTitleAliases}
          action={createAuthorMediaItemAction}
          canCreateFranchise={authorMediaSuggestionData.canCreateFranchise}
          canPublishMediaWithoutReview={authorMediaSuggestionData.canPublishMediaWithoutReview}
          canSuggestFranchises={authorMediaSuggestionData.canSuggestFranchises}
          defaultFranchiseIds={[franchise.id]}
          franchises={authorMediaSuggestionData.franchises}
          mediaCarriers={authorMediaSuggestionData.mediaCarriers}
          mediaTypeFilter="all"
          mediaTypes={sortMediaTypesByCount(mediaTypes, authorMediaSuggestionData.mediaTypeCounts)}
          searchQuery=""
        />
      ) : null}
    </main>
  );
}
