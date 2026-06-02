import { connection } from "next/server";

import {
  getCatalogMediaItems,
  getCatalogMediaTypeCounts,
  getCatalogReleaseYearBounds,
} from "@/db/queries/media-items";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { getCurrentAuthor } from "@/lib/author-auth";
import { parsePage, parsePageSize } from "@/lib/pagination";
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
  const [catalog, mediaTypeCounts, releaseYearBounds] = await Promise.all([
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
  ]);

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1480px] flex-col gap-3">
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
    </main>
  );
}
