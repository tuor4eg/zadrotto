import { AuthorStatistics } from "@/components/author/author-statistics";
import { RecentAchievementShowcase } from "@/components/achievements/recent-achievement-showcase";
import { getAchievementShowcase } from "@/db/queries/achievements";
import { getAuthorReviewSummary } from "@/db/queries/contribution-reviews";
import { getAuthorPublishedMediaItemCount } from "@/db/queries/media-items";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import { getAuthorQuizStatistics } from "@/db/queries/quizzes";
import { requireAuthor } from "@/lib/auth/author-auth";

export default async function AuthorPage() {
  const author = await requireAuthor();
  const mediaTypes = (await getEffectiveMediaTypeOptions(author.id)).filter(({ isEnabled }) => isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map(({ code }) => code);
  const [summary, reviewSummary, contributionCount, achievementItems, quizStatistics] = await Promise.all([
    getAuthorRatingSummary(author.id, enabledMediaTypeCodes),
    getAuthorReviewSummary(author.id, enabledMediaTypeCodes),
    getAuthorPublishedMediaItemCount(author.id, enabledMediaTypeCodes),
    getAchievementShowcase(author.id),
    getAuthorQuizStatistics(author.id),
  ]);
  const latestMediaItemIds = [...new Set([
    ...summary.latestRatings.map((rating) => rating.mediaItemId),
    ...reviewSummary.latestReviews.map((review) => review.mediaItemId),
  ])];
  const latestMediaItems = await getMediaItemTilesByIds(latestMediaItemIds, author.id);
  const latestMediaItemsById = new Map(latestMediaItems.map((item) => [item.id, item]));
  const latestRatingTiles = summary.latestRatings.flatMap((rating) => {
    const item = latestMediaItemsById.get(rating.mediaItemId);
    return item ? [{ currentAuthorScore: item.currentAuthorScore, href: `/media/${item.code}`, item, key: `rating-${rating.mediaItemId}` }] : [];
  });
  const latestReviewTiles = reviewSummary.latestReviews.flatMap((review) => {
    const item = latestMediaItemsById.get(review.mediaItemId);
    return item ? [{ currentAuthorScore: item.currentAuthorScore, href: `/author/reviews/${review.id}/edit`, item, key: `review-${review.id}` }] : [];
  });

  return <div className="author-dashboard flex flex-col gap-3">
    <RecentAchievementShowcase allHref="/author/achievements" items={achievementItems} />
    <AuthorStatistics
      latestRatingTiles={latestRatingTiles}
      latestReviewTiles={latestReviewTiles}
      mediaTypes={mediaTypes}
      ratingSummary={summary}
      ratingsHref="/archive?sort=my_rating_date&mine=rated"
      reviewCount={reviewSummary.reviewsCount}
      reviewsHref="/author/reviews"
      contributionCount={contributionCount}
      quizWinnerCount={quizStatistics.winnerCount}
    />
  </div>;
}
