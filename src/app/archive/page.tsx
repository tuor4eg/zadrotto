import { connection } from "next/server";

import {
  getCatalogMediaItems,
  getCatalogMediaTypeCounts,
  getCatalogReleaseYearBounds,
  getPublishedMediaTypeCounts,
} from "@/db/queries/media-items";
import {
  getFranchiseByCode,
  getFranchiseOptions,
  getPublishedFranchiseBranch,
  searchArchiveSeriesMatches,
} from "@/db/queries/franchises";
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
import { CatalogHeaderControlsWithDemo } from "@/components/user-state/catalog-header-controls-with-demo";
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
  parseArchiveRatingComparison,
  parseRatedByAuthorId,
  type ArchiveRatingComparison,
} from "@/app/media-items-catalog-logic";
import { MediaItemsCatalog } from "@/app/media-items-catalog";
import { createAuthorMediaItemAction } from "@/app/author/(protected)/media/actions";
import { getAuthorMediaFormErrorMessage } from "@/app/author/(protected)/media/messages";
import { sortMediaTypesByCount } from "@/lib/media/types";
import { getActiveQuiz, getActiveQuizParticipantState } from "@/db/queries/quizzes";
import {
  ArchiveSelectedSeries,
  ArchiveSeriesMatches,
} from "@/app/archive/archive-series-context";
import { ArchiveRatedAuthorContext } from "@/app/archive/archive-rated-author-context";
import { getPublicUserProfile } from "@/db/queries/friends";

const CATALOG_PAGE_SIZE_OPTIONS = [24, 48, 72, 96] as const;
const DEFAULT_CATALOG_PAGE_SIZE = 48;

type HomeProps = {
  searchParams: Promise<{
    mine?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    ratedBy?: string;
    compare?: string;
    series?: string;
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
  const requestedSeriesCode = params.series?.trim() ?? "";
  const requestedRatedByAuthorId = parseRatedByAuthorId(params.ratedBy);
  const [effectiveMediaTypes, activeQuiz, selectedSeries, requestedRatedProfile] = await Promise.all([
    getEffectiveMediaTypeOptions(currentAuthor?.id),
    currentAuthor ? getActiveQuiz() : Promise.resolve(null),
    requestedSeriesCode ? getFranchiseByCode(requestedSeriesCode) : Promise.resolve(null),
    requestedRatedByAuthorId
      ? getPublicUserProfile(
          requestedRatedByAuthorId,
          currentAuthor?.id,
          Boolean(currentAdminUser),
        )
      : Promise.resolve(null),
  ]);
  const ratedProfile = requestedRatedProfile?.canViewJournal ? requestedRatedProfile : null;
  const ratedByAuthorId = ratedProfile?.id;
  const ratingComparison = parseArchiveRatingComparison(params.compare);
  const hasRatingSubject = Boolean(ratedByAuthorId || currentAuthor);
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
  const catalogSearchQuery = selectedSeries ? "" : searchQuery;
  const mediaTypeFilter = parseMediaTypeFilter(params.type ?? null, mediaTypes);
  const pageSize = parsePageSize(
    params.pageSize,
    CATALOG_PAGE_SIZE_OPTIONS,
    DEFAULT_CATALOG_PAGE_SIZE,
  );
  const authorRatingFilter = currentAuthor
    ? parseAuthorRatingFilter(params.mine ?? null)
    : "all";
  const urlAuthorRatingFilter = parseAuthorRatingFilter(params.mine ?? null);
  const parsedSort = parseCatalogSort(params.sort ?? null);
  const sort = (
    !hasRatingSubject && isAuthorOnlyCatalogSort(parsedSort)
  ) || (
    ratedByAuthorId && parsedSort === "my_first_experience_year"
  ) ? "title" : parsedSort;
  const sortDirection = parseCatalogSortDirection(params.dir ?? null, sort);
  const yearFilter = parseCatalogYear(params.year ?? null);
  const parsedYearMode = parseCatalogYearMode(params.yearMode ?? null);
  const yearMode = (
    !hasRatingSubject && isAuthorOnlyCatalogYearMode(parsedYearMode)
  ) || (
    ratedByAuthorId && parsedYearMode === "experience"
  ) ? "release" : parsedYearMode;
  const [
    catalog,
    mediaTypeCounts,
    releaseYearBounds,
    authorMediaSuggestionData,
    seriesMatches,
    selectedSeriesBranch,
  ] =
    await Promise.all([
      getCatalogMediaItems({
        authorRatingFilter,
        currentAuthorId: currentAuthor?.id,
        ratedByAuthorId,
        enabledMediaTypeCodes,
        mediaTypeFilter,
        page: parsePage(params.page),
        pageSize,
        searchQuery: catalogSearchQuery,
        seriesId: selectedSeries?.id,
        sort,
        sortDirection,
        yearFilter,
        yearMode,
      }),
      getCatalogMediaTypeCounts({
        authorRatingFilter,
        currentAuthorId: currentAuthor?.id,
        ratedByAuthorId,
        enabledMediaTypeCodes,
        searchQuery: catalogSearchQuery,
        seriesId: selectedSeries?.id,
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
      searchQuery && !selectedSeries
        ? searchArchiveSeriesMatches(searchQuery, enabledMediaTypeCodes)
        : Promise.resolve({ items: [], totalCount: 0 }),
      selectedSeries
        ? getPublishedFranchiseBranch(selectedSeries.id, enabledMediaTypeCodes)
        : Promise.resolve(null),
    ]);
  const preservedCatalogParams = new URLSearchParams();
  for (const key of ["mine", "pageSize", "dir", "sort", "type", "year", "yearMode", "ratedBy", "compare"] as const) {
    const value = params[key];
    if (value) preservedCatalogParams.set(key, value);
  }
  const getArchiveSeriesHref = (seriesCode?: string) => {
    const nextParams = new URLSearchParams(preservedCatalogParams);
    if (seriesCode) nextParams.set("series", seriesCode);
    const queryString = nextParams.toString();
    return queryString ? `/archive?${queryString}` : "/archive";
  };
  const seriesSelectionHrefs = Object.fromEntries(
    seriesMatches.items.flatMap((series) => [
      [series.id, getArchiveSeriesHref(series.code)] as const,
      ...series.parents.map((parent) => [
        parent.id,
        getArchiveSeriesHref(parent.code),
      ] as const),
    ]),
  );
  const getRatedContextHref = (comparison: ArchiveRatingComparison | null) => {
    const nextParams = new URLSearchParams();
    for (const key of ["mine", "pageSize", "q", "series", "dir", "sort", "type", "year", "yearMode"] as const) {
      const value = params[key];
      if (value) nextParams.set(key, value);
    }
    if (ratedByAuthorId && comparison) {
      nextParams.set("ratedBy", String(ratedByAuthorId));
      if (comparison !== "mine") nextParams.set("compare", comparison);
    }
    const queryString = nextParams.toString();
    return queryString ? `/archive?${queryString}` : "/archive";
  };
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
    <main className="archive-page archive-catalog-page text-stone-950">
      <ArchiveToasts
        clearParams={[
          "suggested",
          "suggestedItemCode",
          "suggestedItemId",
          "suggestionError",
        ]}
        messages={toastMessages}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col gap-3">
        <PublicSiteHeader
        adminNotificationCount={headerState.adminNotificationCount}
        author={currentAuthor
          ? { avatarObjectKey: currentAuthor.avatarObjectKey, name: currentAuthor.name }
          : null}
        currentAdminUser={currentAdminUser}
        controls={
          <CatalogHeaderControlsWithDemo
            key={selectedSeries?.code ?? "archive-search"}
            authorRatingFilter={currentAuthor ? authorRatingFilter : urlAuthorRatingFilter}
            currentAuthor={Boolean(currentAuthor)}
            mediaTypeFilter={mediaTypeFilter}
            minReleaseYear={releaseYearBounds.minReleaseYear}
            ratedByAuthor={Boolean(ratedByAuthorId)}
            searchQuery={searchQuery}
            sort={sort}
            sortDirection={sortDirection}
            yearFilter={yearFilter}
            yearMode={yearMode}
          />
        }
        />
        <div className="archive-catalog-shell flex min-h-0 w-full flex-1 flex-col gap-3">
          {selectedSeries ? (
            <ArchiveSelectedSeries
              adminCanEdit={Boolean(currentAdminUser)}
              authorCanAddMedia={Boolean(currentAuthor)}
              clearHref={getArchiveSeriesHref()}
              item={{
                id: selectedSeries.id,
                code: selectedSeries.code,
                title: selectedSeries.title,
                mediaItemsCount: catalog.totalCount,
                parents: selectedSeries.parents,
              }}
              parentHrefs={Object.fromEntries(
                selectedSeries.parents.map((parent) => [
                  parent.id,
                  getArchiveSeriesHref(parent.code),
                ]),
              )}
              mediaTypes={mediaTypes}
              childSeries={(selectedSeriesBranch?.children ?? []).map((child) => ({
                id: child.id,
                href: getArchiveSeriesHref(child.code),
                title: child.title,
              }))}
            />
          ) : (
            <ArchiveSeriesMatches
              items={seriesMatches.items}
              moreHref={`/series?q=${encodeURIComponent(searchQuery)}`}
              selectionHrefs={seriesSelectionHrefs}
              totalCount={seriesMatches.totalCount}
            />
          )}
          {ratedProfile ? (
            <ArchiveRatedAuthorContext
              averageHref={getRatedContextHref("average")}
              clearHref={getRatedContextHref(null)}
              comparison={ratingComparison}
              mineHref={getRatedContextHref("mine")}
              profile={ratedProfile}
            />
          ) : null}
          <MediaItemsCatalog
          activeQuiz={activeQuiz && canGuessActiveQuiz ? { id: activeQuiz.id, mediaTypes: activeQuiz.mediaTypes } : null}
          authorRatingFilter={currentAuthor ? authorRatingFilter : urlAuthorRatingFilter}
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
          ratedAuthorComparison={ratingComparison}
          ratedByAuthorId={ratedByAuthorId ?? null}
          searchQuery={searchQuery}
          seriesCode={selectedSeries?.code ?? null}
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
          defaultFranchiseIds={selectedSeries ? [selectedSeries.id] : []}
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
