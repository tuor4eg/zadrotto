import { connection } from "next/server";

import {
  getCatalogMediaItems,
  getCatalogMediaTypeCounts,
  getCatalogReleaseYearBounds,
  getPublishedMediaTypeCounts,
} from "@/db/queries/media-items";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { isAiScenarioEnabled } from "@/db/queries/ai-scenarios";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { canAuthorCreateFranchise } from "@/lib/authors/media-publication";
import { AI_SCENARIO_KEYS } from "@/lib/ai/scenarios/catalog";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { ArchiveAuthorMediaSuggestion } from "@/app/archive-author-media-suggestion";
import { CatalogHeaderControls } from "@/app/catalog-header-controls";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import {
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseCatalogSortDirection,
  parseCatalogYear,
  parseCatalogYearMode,
  parseMediaTypeFilter,
  isAuthorOnlyCatalogSort,
  isAuthorOnlyCatalogYearMode,
} from "@/app/media-items-catalog-logic";
import { MediaItemsCatalog } from "@/app/media-items-catalog";
import { createAuthorMediaItemAction } from "@/app/author/(protected)/media/actions";
import { getAuthorMediaFormErrorMessage } from "@/app/author/(protected)/media/messages";
import { sortMediaTypesByCount } from "@/lib/media/types";
import { getActiveQuiz, getActiveQuizParticipantState } from "@/db/queries/quizzes";

const CATALOG_PAGE_SIZE_OPTIONS = [24, 48, 72, 96] as const;
const DEFAULT_CATALOG_PAGE_SIZE = 48;

type HomeProps = {
  searchParams: Promise<{
    mine?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    dir?: string;
    sort?: string;
    suggested?: string;
    suggestedItemCode?: string;
    suggestedItemId?: string;
    suggestionError?: string;
    type?: string;
    year?: string;
    yearMode?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  await connection();

  const [headerState, params, archiveSettings] = await Promise.all([
    getPublicSiteHeaderState(),
    searchParams,
    getArchiveSettings(),
  ]);
  const currentAuthor = headerState.author;
  const currentAdminUser = headerState.currentAdminUser;
  const effectiveMediaTypes = await getEffectiveMediaTypeOptions(currentAuthor?.id);
  const activeQuiz = currentAuthor ? await getActiveQuiz() : null;
  const activeQuizParticipant = activeQuiz && currentAuthor
    ? await getActiveQuizParticipantState(currentAuthor.id)
    : null;
  const isActiveQuizParticipant = Boolean(
    activeQuiz && activeQuizParticipant?.quizId === activeQuiz.id,
  );
  const canGuessActiveQuiz = Boolean(
    isActiveQuizParticipant && activeQuizParticipant && !activeQuizParticipant.completed,
  );
  const mediaTypes = effectiveMediaTypes.filter(({ isEnabled }) => isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map(({ code }) => code);
  const searchQuery = params.q?.trim() ?? "";
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null, mediaTypes);
  const pageSize = parsePageSize(
    params.pageSize,
    CATALOG_PAGE_SIZE_OPTIONS,
    DEFAULT_CATALOG_PAGE_SIZE,
  );
  const authorRatingFilter = currentAuthor
    ? parseAuthorRatingFilter(params.mine ?? null)
    : "all";
  const parsedSort = parseCatalogSort(params.sort ?? null);
  const sort = !currentAuthor && isAuthorOnlyCatalogSort(parsedSort) ? "title" : parsedSort;
  const sortDirection = parseCatalogSortDirection(params.dir ?? null, sort);
  const yearFilter = parseCatalogYear(params.year ?? null);
  const parsedYearMode = parseCatalogYearMode(params.yearMode ?? null);
  const yearMode =
    !currentAuthor && isAuthorOnlyCatalogYearMode(parsedYearMode) ? "release" : parsedYearMode;
  const [catalog, mediaTypeCounts, releaseYearBounds, authorMediaSuggestionData] =
    await Promise.all([
      getCatalogMediaItems({
        authorRatingFilter,
        currentAuthorId: currentAuthor?.id,
        enabledMediaTypeCodes,
        mediaTypeFilter,
        page: parsePage(params.page),
        pageSize,
        searchQuery,
        sort,
        sortDirection,
        yearFilter,
        yearMode,
      }),
      getCatalogMediaTypeCounts({
        authorRatingFilter,
        currentAuthorId: currentAuthor?.id,
        enabledMediaTypeCodes,
        searchQuery,
        yearFilter,
        yearMode,
      }),
      getCatalogReleaseYearBounds(enabledMediaTypeCodes),
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
              canPublishFranchisesWithoutReview:
                currentAuthor.canPublishFranchisesWithoutReview,
              canPublishMediaWithoutReview: currentAuthor.canPublishMediaWithoutReview,
              canSuggestFranchises,
              franchises,
              publishedFranchises: franchises.filter(
                (franchise) => franchise.publicationStatus === "published",
              ),
              mediaCarriers,
              mediaTypeCounts,
            }),
          )
        : Promise.resolve(null),
    ]);
  const suggestionErrorMessage = getAuthorMediaFormErrorMessage(params.suggestionError);
  const mediaTypesByCount = authorMediaSuggestionData
    ? sortMediaTypesByCount(mediaTypes, authorMediaSuggestionData.mediaTypeCounts)
    : mediaTypes;
  const suggestedItemId = Number(params.suggestedItemId);
  const suggestedItemHref =
    Number.isInteger(suggestedItemId) && suggestedItemId > 0
      ? params.suggested === "published" && params.suggestedItemCode
        ? `/media/${encodeURIComponent(params.suggestedItemCode)}`
        : params.suggested === "created"
          ? `/author/media/${suggestedItemId}/edit`
          : params.suggested === "submitted" && params.suggestedItemCode
            ? `/author/media?q=${encodeURIComponent(params.suggestedItemCode)}`
            : null
      : null;
  const suggestionSuccessMessage =
    params.suggested === "created"
      ? "создана в черновиках."
      : params.suggested === "submitted"
        ? "создана и отправлена на проверку."
        : params.suggested === "published"
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
            id: params.suggestionError ?? "suggestion-error",
            tone: "error",
            text: suggestionErrorMessage,
          } satisfies ArchiveToast,
        ]
      : []),
  ];

  return (
    <main className="archive-page archive-catalog-page min-h-screen text-stone-950">
      <ArchiveToasts
        clearParams={[
          "suggested",
          "suggestedItemCode",
          "suggestedItemId",
          "suggestionError",
        ]}
        messages={toastMessages}
      />
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader
        adminNotificationCount={headerState.adminNotificationCount}
        author={currentAuthor
          ? { avatarObjectKey: currentAuthor.avatarObjectKey, name: currentAuthor.name }
          : null}
        currentAdminUser={currentAdminUser}
        controls={
          <CatalogHeaderControls
            authorRatingFilter={authorRatingFilter}
            currentAuthor={Boolean(currentAuthor)}
            mediaTypeFilter={mediaTypeFilter}
            minReleaseYear={releaseYearBounds.minReleaseYear}
            searchQuery={searchQuery}
            sort={sort}
            sortDirection={sortDirection}
            yearFilter={yearFilter}
            yearMode={yearMode}
          />
        }
        />
        <div className="archive-catalog-shell flex w-full flex-col gap-3">
          <MediaItemsCatalog
          activeQuiz={activeQuiz && canGuessActiveQuiz ? { id: activeQuiz.id, mediaTypes: activeQuiz.mediaTypes } : null}
          authorRatingFilter={authorRatingFilter}
          currentAdmin={Boolean(currentAdminUser)}
          defaultPageSize={DEFAULT_CATALOG_PAGE_SIZE}
          currentAuthor={
            currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
          }
          canPublishFranchisesWithoutReview={
            authorMediaSuggestionData?.canPublishFranchisesWithoutReview ?? false
          }
          canSuggestFranchises={authorMediaSuggestionData?.canSuggestFranchises ?? false}
          items={catalog.items}
          mediaTypeCounts={mediaTypeCounts}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypes}
          page={catalog.page}
          pageSizeOptions={CATALOG_PAGE_SIZE_OPTIONS}
          pageSize={catalog.pageSize}
          publishedFranchises={authorMediaSuggestionData?.publishedFranchises ?? []}
          searchQuery={searchQuery}
          sort={sort}
          sortDirection={sortDirection}
          totalCount={catalog.totalCount}
          totalPages={catalog.totalPages}
          yearFilter={yearFilter}
          yearMode={yearMode}
          />
        </div>
      </div>
      {currentAuthor && authorMediaSuggestionData ? (
        <ArchiveAuthorMediaSuggestion
          maxTitleAliases={archiveSettings.maxTitleAliases}
          action={createAuthorMediaItemAction}
          canCreateFranchise={authorMediaSuggestionData.canCreateFranchise}
          canPublishMediaWithoutReview={authorMediaSuggestionData.canPublishMediaWithoutReview}
          canSuggestFranchises={authorMediaSuggestionData.canSuggestFranchises}
          franchises={authorMediaSuggestionData.franchises}
          mediaCarriers={authorMediaSuggestionData.mediaCarriers}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypesByCount}
          searchQuery={searchQuery}
        />
      ) : null}
    </main>
  );
}
