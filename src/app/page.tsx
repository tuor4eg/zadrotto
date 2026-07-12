import { connection } from "next/server";

import {
  getCatalogMediaItems,
  getCatalogMediaTypeCounts,
  getCatalogReleaseYearBounds,
} from "@/db/queries/media-items";
import { getFranchiseOptions } from "@/db/queries/franchises";
import { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { canAuthorCreateFranchise } from "@/lib/authors/media-publication";
import { parsePage, parsePageSize } from "@/lib/common/pagination";
import { ArchiveAuthorMediaSuggestion } from "./archive-author-media-suggestion";
import { CatalogStickyHeader } from "./catalog-sticky-header";
import {
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseCatalogSortDirection,
  parseCatalogYear,
  parseCatalogYearMode,
  parseMediaTypeFilter,
  isAuthorOnlyCatalogSort,
  isAuthorOnlyCatalogYearMode,
} from "./media-items-catalog-logic";
import { MediaItemsCatalog } from "./media-items-catalog";
import { createAuthorMediaItemAction } from "./author/(protected)/media/actions";
import { getAuthorMediaFormErrorMessage } from "./author/(protected)/media/messages";

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
    suggestionError?: string;
    type?: string;
    year?: string;
    yearMode?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  await connection();

  const [currentAuthor, currentAdminUser, params, mediaTypes] = await Promise.all([
    getCurrentAuthor(),
    getCurrentAdminUser(),
    searchParams,
    getMediaTypeOptions(),
  ]);
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
        searchQuery,
        yearFilter,
        yearMode,
      }),
      getCatalogReleaseYearBounds(),
      currentAuthor
        ? Promise.all([getFranchiseOptions(), getMediaCarrierOptions()]).then(
            ([franchises, mediaCarriers]) => ({
              canCreateFranchise: canAuthorCreateFranchise({
                canPublishMediaWithoutReview: currentAuthor.canPublishMediaWithoutReview,
              }),
              canPublishMediaWithoutReview: currentAuthor.canPublishMediaWithoutReview,
              franchises,
              mediaCarriers,
            }),
          )
        : Promise.resolve(null),
    ]);
  const suggestionErrorMessage = getAuthorMediaFormErrorMessage(params.suggestionError);
  const suggestionSuccessMessage =
    params.suggested === "created"
      ? "Запись создана в черновиках."
      : params.suggested === "submitted"
        ? "Запись создана и отправлена на проверку."
        : params.suggested === "published"
          ? "Запись создана и опубликована."
          : null;
  const toastMessages = [
    ...(suggestionSuccessMessage
      ? [
          {
            id: "suggested",
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
        clearParams={["suggested", "suggestionError"]}
        messages={toastMessages}
      />
      <div className="archive-catalog-shell mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <CatalogStickyHeader
          authorRatingFilter={authorRatingFilter}
          currentAdminUser={Boolean(currentAdminUser)}
          currentAuthor={Boolean(currentAuthor)}
          mediaTypeFilter={mediaTypeFilter}
          minReleaseYear={releaseYearBounds.minReleaseYear}
          searchQuery={searchQuery}
          sort={sort}
          sortDirection={sortDirection}
          yearFilter={yearFilter}
          yearMode={yearMode}
        />

        <MediaItemsCatalog
          authorRatingFilter={authorRatingFilter}
          defaultPageSize={DEFAULT_CATALOG_PAGE_SIZE}
          currentAuthor={
            currentAuthor ? { name: currentAuthor.name, code: currentAuthor.code } : null
          }
          items={catalog.items}
          mediaTypeCounts={mediaTypeCounts}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypes}
          page={catalog.page}
          pageSizeOptions={CATALOG_PAGE_SIZE_OPTIONS}
          pageSize={catalog.pageSize}
          searchQuery={searchQuery}
          sort={sort}
          sortDirection={sortDirection}
          totalCount={catalog.totalCount}
          totalPages={catalog.totalPages}
          yearFilter={yearFilter}
          yearMode={yearMode}
        />
      </div>
      {currentAuthor && authorMediaSuggestionData ? (
        <ArchiveAuthorMediaSuggestion
          action={createAuthorMediaItemAction}
          canCreateFranchise={authorMediaSuggestionData.canCreateFranchise}
          canPublishMediaWithoutReview={authorMediaSuggestionData.canPublishMediaWithoutReview}
          franchises={authorMediaSuggestionData.franchises}
          mediaCarriers={authorMediaSuggestionData.mediaCarriers}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypes={mediaTypes}
          searchQuery={searchQuery}
        />
      ) : null}
    </main>
  );
}
