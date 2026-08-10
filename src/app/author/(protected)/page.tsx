import { AuthorStatistics } from "@/components/author/author-statistics";
import { getAuthorReviewSummary } from "@/db/queries/contribution-reviews";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import { requireAuthor } from "@/lib/auth/author-auth";

export default async function AuthorPage() {
  const author = await requireAuthor();
  const mediaTypes = (await getEffectiveMediaTypeOptions(author.id)).filter(({ isEnabled }) => isEnabled);
  const enabledMediaTypeCodes = mediaTypes.map(({ code }) => code);
  const [summary, reviewSummary] = await Promise.all([
    getAuthorRatingSummary(author.id, enabledMediaTypeCodes),
    getAuthorReviewSummary(author.id, enabledMediaTypeCodes),
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

  return <AuthorStatistics
    latestRatingTiles={latestRatingTiles}
    latestReviewTiles={latestReviewTiles}
    mediaTypes={mediaTypes}
    ratingSummary={summary}
    ratingsHref="/archive?sort=my_rating_date&mine=rated"
    reviewCount={reviewSummary.reviewsCount}
    reviewsHref="/author/reviews"
  />;
}
