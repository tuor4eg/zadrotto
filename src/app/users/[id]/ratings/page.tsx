import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MediaItemTile } from "@/app/media-item-tile";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { PaginationNav } from "@/components/pagination-nav";
import { getPublicRatingJournal, getPublicUserProfile } from "@/db/queries/friends";
import { getAccessibleMediaTypeCodes, getAllMediaTypeOptions } from "@/db/queries/media-types";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { parsePage, parsePageSize } from "@/lib/common/pagination";

import { PublicUserHeader } from "../public-user-header";

const RATING_PAGE_SIZE_OPTIONS = [24, 48, 72, 96] as const;
const DEFAULT_RATING_PAGE_SIZE = 48;
const PUBLIC_RATINGS_GRID_CLASS_NAME =
  "grid grid-cols-3 content-start gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseId((await params).id);
  if (!id) return {};
  const [current, admin] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()]);
  const profile = await getPublicUserProfile(id, current?.id, Boolean(admin));
  return profile ? { title: `Оценки — ${profile.name}` } : {};
}

export default async function PublicUserRatingsPage({ params, searchParams }: PageProps) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const [headerState, query] = await Promise.all([getPublicSiteHeaderState(), searchParams]);
  const current = headerState.author;
  const isAdmin = headerState.currentAdminUser;
  const profile = await getPublicUserProfile(id, current?.id, isAdmin);
  if (!profile) notFound();

  const basePath = `/users/${profile.id}`;
  const ratingsPath = `${basePath}/ratings`;
  const pageSize = parsePageSize(
    query.pageSize,
    RATING_PAGE_SIZE_OPTIONS,
    DEFAULT_RATING_PAGE_SIZE,
  );
  const accessibleMediaTypeCodes = profile.canViewJournal
    ? isAdmin
      ? (await getAllMediaTypeOptions()).map((item) => item.code)
      : await getAccessibleMediaTypeCodes(current?.id)
    : [];
  const journalPage = profile.canViewJournal
    ? await getPublicRatingJournal(profile.id, parsePage(query.page), accessibleMediaTypeCodes, pageSize)
    : null;
  const ratingTiles = journalPage
    ? await getMediaItemTilesByIds(journalPage.items.map((item) => item.mediaItemId))
    : [];
  const ratingTilesById = new Map(ratingTiles.map((item) => [item.id, item]));

  return (
    <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
      <div className="mx-auto w-full max-w-[1480px] space-y-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <PublicUserHeader active="ratings" currentAdmin={isAdmin} currentAuthor={Boolean(current)} profile={profile} returnTo={ratingsPath} />

        {!profile.canViewJournal || !journalPage ? (
          <p className="archive-paper-surface archive-panel p-5 text-stone-600 sm:p-7">Журнал пользователя доступен только его друзьям.</p>
        ) : (
          <section className="archive-paper archive-panel p-4 sm:p-5">
            {journalPage.items.length > 0 ? (
              <div className={PUBLIC_RATINGS_GRID_CLASS_NAME}>
                {journalPage.items.map((rating) => {
                  const item = ratingTilesById.get(rating.mediaItemId);
                  return item ? (
                    <MediaItemTile
                      key={rating.mediaItemId}
                      currentAuthorScore={rating.score}
                      href={`/media/${item.code}`}
                      item={item}
                      ratingDisplay="author-only"
                    />
                  ) : null;
                })}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-stone-600">Здесь пока ничего нет.</p>
            )}
            <div className="mt-3">
              <PaginationNav
                basePath={ratingsPath}
                itemLabel="оценок"
                page={journalPage.page}
                pageSize={journalPage.pageSize}
                pageSizeOptions={RATING_PAGE_SIZE_OPTIONS}
                searchParams={{ pageSize: String(journalPage.pageSize) }}
                showPageJump
                totalCount={journalPage.totalCount}
                totalPages={journalPage.totalPages}
                variant="archive"
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
