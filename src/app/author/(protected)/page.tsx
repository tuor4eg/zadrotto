import Link from "next/link";
import {
  CalendarCheck,
  ChartNoAxesColumn,
  FileText,
  Gauge,
  Info,
  Shapes,
  Star,
} from "lucide-react";

import { ResponsiveTileGrid } from "@/components/archive/responsive-tile-grid";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthorReviewSummary } from "@/db/queries/contribution-reviews";
import { getMediaItemTilesByIds } from "@/db/queries/media-item-tiles";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getMediaTypeLabel, sortMediaTypesByCount } from "@/lib/media/types";
import { RATING_SCORE_VALUES, formatScore } from "@/lib/ratings/score";
import { RATING_BAR_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";
import { AuthorMediaInterestsDonut } from "./author-media-interests-donut";

export default async function AuthorPage() {
  const author = await requireAuthor();
  const mediaTypes = (await getEffectiveMediaTypeOptions(author.id)).filter(
    ({ isEnabled }) => isEnabled,
  );
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

    return item
      ? [{
          currentAuthorScore: item.currentAuthorScore,
          href: `/media/${item.code}`,
          item,
          key: `rating-${rating.mediaItemId}`,
        }]
      : [];
  });
  const latestReviewTiles = reviewSummary.latestReviews.flatMap((review) => {
    const item = latestMediaItemsById.get(review.mediaItemId);

    return item
      ? [{
          currentAuthorScore: item.currentAuthorScore,
          href: `/author/reviews/${review.id}/edit`,
          item,
          key: `review-${review.id}`,
        }]
      : [];
  });
  const distributionByMediaType = new Map(
    summary.distribution.map((item) => [item.mediaType, item.ratingsCount]),
  );
  const mediaTypesByRatingCount = sortMediaTypesByCount(
    mediaTypes,
    summary.distribution.map((item) => ({
      count: item.ratingsCount,
      mediaType: item.mediaType,
    })),
  );
  const interestItems = mediaTypesByRatingCount.map((mediaType) => ({
    code: mediaType.code,
    count: distributionByMediaType.get(mediaType.code) ?? 0,
    label: getMediaTypeLabel(mediaType.code, mediaTypes),
  }));
  const distributionByScore = new Map(
    summary.scoreDistribution.map((item) => [item.score, item.ratingsCount]),
  );
  const maxScoreDistributionCount = Math.max(
    1,
    ...summary.scoreDistribution.map((item) => item.ratingsCount),
  );
  const scoreDistributionValues = [...RATING_SCORE_VALUES].reverse();
  const statistics = [
    { Icon: Star, label: "Оценок", value: summary.ratingsCount },
    { Icon: Gauge, label: "Средняя", value: formatScore(summary.averageScore) },
    { Icon: CalendarCheck, label: "Оценено в этом году", value: summary.currentYearRatingsCount },
    { Icon: FileText, label: "Рецензий", value: reviewSummary.reviewsCount },
  ];

  return (
    <div className="author-dashboard flex flex-col gap-3">
      <section className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,0.65fr)]">
        <Card className="archive-paper archive-panel h-full">
          <CardContent className="p-4 sm:px-5 sm:pt-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
              <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
                <Shapes className="size-5 shrink-0 text-red-950/70" />
                Мои интересы
              </h2>
            </div>
            <AuthorMediaInterestsDonut items={interestItems} />
          </CardContent>
        </Card>

        <Card className="archive-paper archive-panel h-full">
          <CardContent className="flex h-full flex-col p-4 sm:px-5 sm:pt-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
              <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
                <ChartNoAxesColumn className="size-5 shrink-0 text-red-950/70" />
                Распределение оценок
              </h2>
            </div>
            <div
              aria-label="Распределение количества оценок от 1 до 10"
              className="flex min-h-0 flex-1 flex-col"
              role="img"
            >
              <div className="relative grid min-h-32 flex-1 grid-cols-10 items-end gap-1 border-b border-stone-400/50 sm:gap-1.5">
                {scoreDistributionValues.map((score) => {
                  const count = distributionByScore.get(score) ?? 0;
                  const toneClassName = RATING_BAR_TONE_CLASS_NAMES[getRatingTone(score)];
                  const barHeightPercent = count > 0
                    ? Math.max(2, (count / maxScoreDistributionCount) * 88)
                    : 0;

                  return (
                    <span
                      key={score}
                      className="relative h-full min-w-0"
                    >
                      <span
                        className="absolute inset-x-0 text-center font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-700"
                        style={{ bottom: `calc(${barHeightPercent}% + 0.125rem)` }}
                      >
                        {count}
                      </span>
                      <span
                        className={`absolute bottom-0 left-1/2 block w-full max-w-6 -translate-x-1/2 rounded-t-sm ${
                          count > 0 ? toneClassName : "bg-transparent"
                        }`}
                        style={{ height: `${barHeightPercent}%` }}
                      />
                    </span>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-10 gap-1 text-center sm:gap-1.5">
                {scoreDistributionValues.map((score) => (
                  <span
                    key={score}
                    className="font-mono text-[10px] font-semibold leading-none tabular-nums text-stone-950"
                  >
                    {formatScore(score)}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="archive-paper archive-panel h-full">
          <CardContent className="p-4 sm:px-5 sm:pt-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
              <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
                <Info className="size-5 shrink-0 text-red-950/70" />
                Статистика
              </h2>
            </div>
            <div className="divide-y divide-dashed divide-stone-400/35">
              {statistics.map(({ Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="flex items-center gap-2 font-serif text-lg">
                    <Icon className="size-4 text-red-950/65" />
                    {label}
                  </span>
                  <strong className="shrink-0 font-mono text-sm font-normal tabular-nums text-stone-600">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className="archive-paper archive-panel p-4 sm:px-5 sm:pt-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
            <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
              <Star className="size-5 shrink-0 text-red-950/70" />
              Последние оценки
            </h2>
            <Link href="/archive?sort=my_rating_date&mine=rated" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">
              Смотреть всё →
            </Link>
          </div>
          <ResponsiveTileGrid
            initialColumnCount={3}
            items={latestRatingTiles}
            variant="top"
          />
        </Card>

        <Card className="archive-paper archive-panel p-4 sm:px-5 sm:pt-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-400/25 pb-3">
            <h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">
              <FileText className="size-5 shrink-0 text-red-950/70" />
              Последние рецензии
            </h2>
            <Link href="/author/reviews" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">
              Смотреть всё →
            </Link>
          </div>
          <ResponsiveTileGrid
            initialColumnCount={3}
            items={latestReviewTiles}
            variant="top"
          />
        </Card>
      </section>
    </div>
  );
}
