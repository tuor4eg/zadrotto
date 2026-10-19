import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { AuthorStatistics } from "@/components/author/author-statistics";
import { HomeAuthorStatistics } from "@/app/main/home-author-statistics";
import { RecentAchievementShowcase } from "@/components/achievements/recent-achievement-showcase";
import { getRecentAwardedAchievements } from "@/db/queries/achievements";
import { Alert } from "@/components/ui/alert";
import { getPublicAuthorStatistics, getPublicUserProfile } from "@/db/queries/friends";
import { getAccessibleMediaTypeCodes, getAllMediaTypeOptions, getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getAuthorQuizStatistics } from "@/db/queries/quizzes";
import { getPublicAuthorLevel } from "@/db/queries/reputation";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { formatScore } from "@/lib/ratings/score";

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
  const [achievementItems, level, journal, quizStatistics] = await Promise.all([
    getRecentAwardedAchievements(profile.id),
    getPublicAuthorLevel(profile.id),
    (async () => {
      if (!profile.canViewJournal) return { mediaTypes: [], statistics: null };
      const [accessibleCodes, options] = await Promise.all([
        isAdmin
          ? getAllMediaTypeOptions().then((items) => items.map((item) => item.code))
          : getAccessibleMediaTypeCodes(current?.id),
        getEffectiveMediaTypeOptions(profile.id),
      ]);
      const accessibleCodeSet = new Set(accessibleCodes);
      const mediaTypes = options.filter((item) => item.isEnabled && accessibleCodeSet.has(item.code));
      const statistics = await getPublicAuthorStatistics(profile.id, mediaTypes.map((item) => item.code));
      return { mediaTypes, statistics };
    })(),
    profile.canViewJournal ? getAuthorQuizStatistics(profile.id) : Promise.resolve(null),
  ]);
  const basePath = `/users/${profile.id}`;
  const { mediaTypes, statistics } = journal;
  const statisticsMediaItemIds = statistics ? [...new Set([
    ...statistics.latestRatings.map((item) => item.mediaItemId),
    ...statistics.latestReviews.map((item) => item.mediaItemId),
  ])] : [];
  const statisticsMediaItems = await getMediaItemTilesByIds(statisticsMediaItemIds, profile.id);
  const statisticsMediaItemsById = new Map(statisticsMediaItems.map((item) => [item.id, item]));
  const latestRatingTiles = statistics?.latestRatings.flatMap((rating) => {
    const item = statisticsMediaItemsById.get(rating.mediaItemId);
    return item ? [{ currentAuthorScore: rating.score, href: `/media/${item.code}`, item: { ...item, title: rating.partLabel ? `${item.title} — ${rating.partLabel}` : item.title }, key: `rating-${rating.id}`, ratingDisplay: "author-only" as const }] : [];
  }) ?? [];
  const latestReviewTiles = statistics?.latestReviews.flatMap((review) => {
    const item = statisticsMediaItemsById.get(review.mediaItemId);
    return item ? [{ currentAuthorScore: review.authorScore, href: `/reviews/${review.id}`, item: { ...item, title: review.partLabel ? `${item.title} — ${review.partLabel}` : item.title }, key: `review-${review.id}`, ratingDisplay: "author-only" as const }] : [];
  }) ?? [];

  return <main className="archive-page min-h-screen px-3 py-4 text-stone-950 sm:px-5 lg:px-7">
    <div className="mx-auto w-full max-w-[1480px] space-y-3">
      <PublicSiteHeader {...headerState.headerProps} />
      {query.friendship === "error" || query.friendship === "conflict" ? <Alert variant="destructive">Не удалось изменить состояние дружбы. Возможно, оно уже изменилось.</Alert> : null}
      <PublicUserHeader
        currentAdmin={isAdmin}
        currentAuthor={Boolean(current)}
        level={level}
        profile={profile}
        returnTo={basePath}
        statistics={statistics && quizStatistics ? [
          { label: "Оценок", value: statistics.ratingSummary.ratingsCount.toLocaleString("ru-RU") },
          { label: "Средняя", value: formatScore(statistics.ratingSummary.averageScore) },
          { label: "Рецензий", value: statistics.reviewCount.toLocaleString("ru-RU") },
          { label: "Добавлено в архив", value: statistics.contributionCount.toLocaleString("ru-RU") },
          { label: "Очков за квизы", value: quizStatistics.totalPoints.toLocaleString("ru-RU") },
        ] : undefined}
      />

      {profile.canViewJournal && statistics ? <section className="space-y-3">
          <AuthorStatistics
            interestsTitle="Интересы"
            latestRatingTiles={latestRatingTiles}
            latestReviewTiles={latestReviewTiles}
            mediaTypes={mediaTypes}
            ratingSummary={statistics.ratingSummary}
            ratingsHref={`/archive?ratedBy=${profile.id}&sort=my_rating_date`}
            reviewCount={statistics.reviewCount}
            reviewsHref={`/reviews?author=${profile.id}`}
            contributionCount={statistics.contributionCount}
            showAnalytics={false}
            showStatistics={false}
            tileGridInitialColumnCount={4}
            tileGridVariant="topCompact"
          />
          <HomeAuthorStatistics mediaTypes={mediaTypes} ratingSummary={statistics.ratingSummary} title="Интересы по годам" />
      </section> : <p className="archive-paper-surface archive-panel p-5 text-stone-600 sm:p-7">Архив пользователя доступен только его друзьям.</p>}

      <RecentAchievementShowcase allHref={`${basePath}/achievements`} items={achievementItems} />
    </div>
  </main>;
}
