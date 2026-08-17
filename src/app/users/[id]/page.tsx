import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { MediaItemTile } from "@/app/media-item-tile";
import { AdaptiveArchivePageSizeSync } from "@/components/archive/adaptive-archive-page-size-sync";
import { AuthorStatistics } from "@/components/author/author-statistics";
import { RecentAchievementShowcase } from "@/components/achievements/recent-achievement-showcase";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { PaginationNav } from "@/components/pagination-nav";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { getPublicAuthorStatistics, getPublicRatingJournal, getPublicReviewJournal, getPublicUserProfile } from "@/db/queries/friends";
import { getAccessibleMediaTypeCodes, getAllMediaTypeOptions, getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { ARCHIVE_CATALOG_GRID_CLASS_NAME, parseArchiveCatalogPageSize } from "@/lib/archive/tile-grid-capacity";
import { parsePage } from "@/lib/common/pagination";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ friendship?: string; journal?: string; page?: string; pageSize?: string; view?: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function formatDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseId((await params).id);
  if (!id) return {};
  const [current, admin] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()]);
  const profile = await getPublicUserProfile(id, current?.id, Boolean(admin));
  return profile ? { title: profile.name } : {};
}

export default async function PublicUserPage({ params, searchParams }: PageProps) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const [current, admin, query] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser(), searchParams]);
  const isAdmin = Boolean(admin);
  const profile = await getPublicUserProfile(id, current?.id, isAdmin);
  if (!profile) notFound();
  const view = query.view === "ratings" || query.view === "reviews"
    ? query.view
    : query.journal === "ratings" || query.journal === "reviews"
      ? query.journal
      : "statistics";
  const achievementItems = view === "statistics" ? await getAchievementShowcase(profile.id) : [];
  const page = parsePage(query.page);
  const ratingsPageSize = parseArchiveCatalogPageSize(query.pageSize);
  const accessibleMediaTypeCodes = profile.canViewJournal
    ? isAdmin
      ? (await getAllMediaTypeOptions()).map((item) => item.code)
      : await getAccessibleMediaTypeCodes(current?.id)
    : [];
  const journalPage = profile.canViewJournal && view !== "statistics"
    ? view === "reviews"
      ? await getPublicReviewJournal(profile.id, page, accessibleMediaTypeCodes)
      : await getPublicRatingJournal(profile.id, page, accessibleMediaTypeCodes, ratingsPageSize)
    : null;
  const ratingTiles = journalPage && view === "ratings"
    ? await getMediaItemTilesByIds(
        journalPage.items.flatMap((item) => "mediaItemId" in item ? [item.mediaItemId] : []),
      )
    : [];
  const ratingTilesById = new Map(ratingTiles.map((item) => [item.id, item]));
  const basePath = `/users/${profile.id}`;
  const accessibleMediaTypeCodeSet = new Set(accessibleMediaTypeCodes);
  const mediaTypes = profile.canViewJournal
    ? (await getEffectiveMediaTypeOptions(profile.id)).filter((item) => item.isEnabled && accessibleMediaTypeCodeSet.has(item.code))
    : [];
  const statistics = profile.canViewJournal && view === "statistics"
    ? await getPublicAuthorStatistics(profile.id, mediaTypes.map((item) => item.code))
    : null;
  const statisticsMediaItemIds = statistics ? [...new Set([
    ...statistics.latestRatings.map((item) => item.mediaItemId),
    ...statistics.latestReviews.map((item) => item.mediaItemId),
  ])] : [];
  const statisticsMediaItems = await getMediaItemTilesByIds(statisticsMediaItemIds, profile.id);
  const statisticsMediaItemsById = new Map(statisticsMediaItems.map((item) => [item.id, item]));
  const latestRatingTiles = statistics?.latestRatings.flatMap((rating) => {
    const item = statisticsMediaItemsById.get(rating.mediaItemId);
    return item ? [{ currentAuthorScore: rating.score, href: `/media/${item.code}`, item, key: `rating-${item.id}`, ratingDisplay: "author-only" as const }] : [];
  }) ?? [];
  const latestReviewTiles = statistics?.latestReviews.flatMap((review) => {
    const item = statisticsMediaItemsById.get(review.mediaItemId);
    return item ? [{ currentAuthorScore: item.currentAuthorScore, href: `/media/${item.code}`, item, key: `review-${review.id}`, ratingDisplay: "author-only" as const }] : [];
  }) ?? [];

  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
    <div className="mx-auto w-full max-w-[1480px] space-y-3">
      <nav className="text-sm text-stone-600"><Link href="/" className="underline underline-offset-4">На главную</Link></nav>
      {query.friendship === "error" || query.friendship === "conflict" ? <Alert variant="destructive">Не удалось изменить состояние дружбы. Возможно, оно уже изменилось.</Alert> : null}
      <header className="archive-paper-surface archive-panel">
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-7">
          <Avatar name={profile.name} objectKey={profile.avatarObjectKey} className="size-20 text-2xl" />
          <div className="min-w-0 flex-1"><h1 className="break-words font-serif text-3xl sm:text-4xl">{profile.name}</h1></div>
          {current ? <FriendshipControls returnTo={basePath} state={profile.relationState} targetId={profile.id} /> : isAdmin ? null : <Link href="/author/login" className={buttonVariants({ variant: "outline" })}>Войти</Link>}
        </div>
        <nav aria-label="Разделы профиля пользователя" className="flex flex-wrap gap-2 border-t border-stone-300/70 px-5 py-3 sm:px-7">
          <Link href={basePath} className={buttonVariants({ variant: view === "statistics" ? "default" : "outline", size: "sm" })}>Статистика</Link>
          {profile.canViewJournal ? <>
            <Link href={`${basePath}?view=ratings`} className={buttonVariants({ variant: view === "ratings" ? "default" : "outline", size: "sm" })}>Оценки</Link>
            <Link href={`${basePath}?view=reviews`} className={buttonVariants({ variant: view === "reviews" ? "default" : "outline", size: "sm" })}>Рецензии</Link>
          </> : null}
          <Link href={`${basePath}/achievements`} className={buttonVariants({ variant: "outline", size: "sm" })}>Ачивки</Link>
        </nav>
      </header>

      {view === "statistics" ? <RecentAchievementShowcase allHref={`${basePath}/achievements`} items={achievementItems} /> : null}

      {profile.canViewJournal ? <section className="space-y-3">
          {view === "statistics" && statistics ? <AuthorStatistics
            interestsTitle="Интересы"
            latestRatingTiles={latestRatingTiles}
            latestReviewTiles={latestReviewTiles}
            mediaTypes={mediaTypes}
            ratingSummary={statistics.ratingSummary}
            ratingsHref={`${basePath}?view=ratings`}
            reviewCount={statistics.reviewCount}
            reviewsHref={`${basePath}?view=reviews`}
            contributionCount={statistics.contributionCount}
          /> : journalPage?.items.length ? view === "ratings" ? <div className="archive-paper archive-panel p-4 sm:p-5">
            <Suspense fallback={null}>
              <AdaptiveArchivePageSizeSync pageSize={journalPage.pageSize} />
            </Suspense>
            <div className={ARCHIVE_CATALOG_GRID_CLASS_NAME}>
              {journalPage.items.map((item) => {
                if (!("score" in item) || !("mediaItemId" in item)) return null;
                const tile = ratingTilesById.get(item.mediaItemId);
                return tile ? <MediaItemTile key={item.mediaItemId} currentAuthorScore={item.score} href={`/media/${item.code}`} item={tile} ratingDisplay="author-only" /> : null;
              })}
            </div>
            <div className="mt-3">
              <PaginationNav basePath={basePath} itemLabel="оценок" page={journalPage.page} pageSize={journalPage.pageSize} searchParams={{ pageSize: String(journalPage.pageSize), view }} totalCount={journalPage.totalCount} totalPages={journalPage.totalPages} variant="archive" />
            </div>
          </div> : <div className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white/60">
            {journalPage.items.map((item) => "reviewTitle" in item ? <article key={`${item.code}-${item.reviewTitle}`} className="space-y-1 p-4">
              <Link href={`/media/${item.code}`} className="font-medium underline decoration-stone-300 underline-offset-4 hover:text-red-950">{item.reviewTitle}</Link>
              <p className="text-sm text-stone-600">{item.mediaTitle} · {formatDate(item.publishedAt ?? item.updatedAt)}</p>
            </article> : null)}
          </div> : <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-stone-600">Здесь пока ничего нет.</p>}
          {journalPage && view === "reviews" ? <PaginationNav basePath={basePath} itemLabel="рецензий" page={journalPage.page} pageSize={journalPage.pageSize} searchParams={{ view }} totalCount={journalPage.totalCount} totalPages={journalPage.totalPages} variant="archive" /> : null}
      </section> : <p className="archive-paper-surface archive-panel p-5 text-stone-600 sm:p-7">Журнал пользователя доступен только его друзьям.</p>}
    </div>
  </main>;
}
