import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { AuthorStatistics } from "@/components/author/author-statistics";
import { RecentAchievementShowcase } from "@/components/achievements/recent-achievement-showcase";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { Alert } from "@/components/ui/alert";
import { getPublicAuthorStatistics, getPublicUserProfile } from "@/db/queries/friends";
import { getAccessibleMediaTypeCodes, getAllMediaTypeOptions, getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";

import { PublicUserHeader } from "./public-user-header";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ friendship?: string }>;
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
  return profile ? { title: profile.name } : {};
}

export default async function PublicUserPage({ params, searchParams }: PageProps) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const [headerState, query] = await Promise.all([getPublicSiteHeaderState(), searchParams]);
  const current = headerState.author;
  const isAdmin = headerState.currentAdminUser;
  const profile = await getPublicUserProfile(id, current?.id, isAdmin);
  if (!profile) notFound();
  const achievementItems = await getAchievementShowcase(profile.id);
  const accessibleMediaTypeCodes = profile.canViewJournal
    ? isAdmin
      ? (await getAllMediaTypeOptions()).map((item) => item.code)
      : await getAccessibleMediaTypeCodes(current?.id)
    : [];
  const basePath = `/users/${profile.id}`;
  const accessibleMediaTypeCodeSet = new Set(accessibleMediaTypeCodes);
  const mediaTypes = profile.canViewJournal
    ? (await getEffectiveMediaTypeOptions(profile.id)).filter((item) => item.isEnabled && accessibleMediaTypeCodeSet.has(item.code))
    : [];
  const statistics = profile.canViewJournal
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
    return item ? [{ currentAuthorScore: item.currentAuthorScore, href: `/reviews/${review.id}`, item, key: `review-${review.id}`, ratingDisplay: "author-only" as const }] : [];
  }) ?? [];

  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
    <div className="mx-auto w-full max-w-[1480px] space-y-3">
      <PublicSiteHeader {...headerState.headerProps} />
      {query.friendship === "error" || query.friendship === "conflict" ? <Alert variant="destructive">Не удалось изменить состояние дружбы. Возможно, оно уже изменилось.</Alert> : null}
      <PublicUserHeader active="statistics" currentAdmin={isAdmin} currentAuthor={Boolean(current)} profile={profile} returnTo={basePath} />

      <RecentAchievementShowcase allHref={`${basePath}/achievements`} items={achievementItems} />

      {profile.canViewJournal && statistics ? <section className="space-y-3">
          <AuthorStatistics
            interestsTitle="Интересы"
            latestRatingTiles={latestRatingTiles}
            latestReviewTiles={latestReviewTiles}
            mediaTypes={mediaTypes}
            ratingSummary={statistics.ratingSummary}
            ratingsHref={`${basePath}/ratings`}
            reviewCount={statistics.reviewCount}
            reviewsHref={`/reviews?author=${profile.id}`}
            contributionCount={statistics.contributionCount}
          />
      </section> : <p className="archive-paper-surface archive-panel p-5 text-stone-600 sm:p-7">Журнал пользователя доступен только его друзьям.</p>}
    </div>
  </main>;
}
