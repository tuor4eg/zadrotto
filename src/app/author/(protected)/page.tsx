import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuthorReviewSummary } from "@/db/queries/contribution-reviews";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import { requireAuthor } from "@/lib/author-auth";
import {
  CONTRIBUTION_STATUS_VALUE_LABELS,
  type ContributionStatus,
} from "@/lib/contributions";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media-types";
import { RATING_SCORE_VALUES, formatRatingsCount, formatScore } from "@/lib/rating-score";
import { RATING_BAR_TONE_CLASS_NAMES, getRatingTone } from "@/lib/rating-tone";

const REVIEW_STATUS_BADGE_VARIANTS: Record<
  ContributionStatus,
  "default" | "outline" | "positive" | "warning" | "destructive"
> = {
  draft: "outline",
  submitted: "warning",
  published: "positive",
  rejected: "destructive",
  hidden: "default",
};

function formatDate(value: Date | string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export default async function AuthorPage() {
  const author = await requireAuthor();
  const [summary, reviewSummary] = await Promise.all([
    getAuthorRatingSummary(author.id),
    getAuthorReviewSummary(author.id),
  ]);
  const distributionByMediaType = new Map(
    summary.distribution.map((item) => [item.mediaType, item.ratingsCount]),
  );
  const distributionByScore = new Map(
    summary.scoreDistribution.map((item) => [item.score, item.ratingsCount]),
  );
  const maxScoreDistributionCount = Math.max(
    1,
    ...summary.scoreDistribution.map((item) => item.ratingsCount),
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Оценок
            </span>
            <span className="mt-1.5 block font-mono text-2xl font-semibold tabular-nums text-stone-950">
              {summary.ratingsCount}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">
              {formatRatingsCount(summary.ratingsCount)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Средняя
            </span>
            <span className="mt-1.5 block font-mono text-2xl font-semibold tabular-nums text-stone-950">
              {formatScore(summary.averageScore)}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">личная</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Оценено в этом году
            </span>
            <span className="mt-1.5 block font-mono text-2xl font-semibold tabular-nums text-stone-950">
              {summary.currentYearRatingsCount}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">
              {formatRatingsCount(summary.currentYearRatingsCount)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Рецензий
            </span>
            <span className="mt-1.5 block font-mono text-2xl font-semibold tabular-nums text-stone-950">
              {reviewSummary.reviewsCount}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">
              авторских текстов
            </span>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              По типам медиа
            </span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MEDIA_TYPES.map((mediaType) => {
                const count = distributionByMediaType.get(mediaType) ?? 0;

                return (
                  <div
                    key={mediaType}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-stone-200 bg-stone-100/80 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                  >
                    <span className="truncate text-xs text-stone-600">
                      {MEDIA_TYPE_LABELS[mediaType]}
                    </span>
                    <span className="font-mono text-sm font-semibold leading-none tabular-nums text-stone-950">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              Распределение оценок
            </span>
            <div className="mt-2 grid gap-1.5">
              {RATING_SCORE_VALUES.map((score) => {
                const count = distributionByScore.get(score) ?? 0;
                const toneClassName = RATING_BAR_TONE_CLASS_NAMES[getRatingTone(score)];
                const width = `${Math.max(3, (count / maxScoreDistributionCount) * 100)}%`;

                return (
                  <div
                    key={score}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2"
                  >
                    <span className="font-mono text-xs font-semibold tabular-nums text-stone-700">
                      {formatScore(score)}
                    </span>
                    <span className="h-5 overflow-hidden rounded-sm border border-stone-200 bg-stone-100">
                      <span
                        className={`block h-full rounded-sm ${
                          count > 0 ? toneClassName : "bg-stone-200/80"
                        }`}
                        style={{ width }}
                      />
                    </span>
                    <span className="text-right font-mono text-xs font-semibold tabular-nums text-stone-950">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-stone-200 px-4 py-3">
            <CardTitle className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">
              Последние оценки
            </CardTitle>
          </CardHeader>

          {summary.latestRatings.length === 0 ? (
            <CardContent className="p-4 text-sm text-stone-500">Пока нет оценок.</CardContent>
          ) : (
            <CardContent className="divide-y divide-stone-200 p-0">
              {summary.latestRatings.map((rating) => (
                <Link
                  key={rating.mediaItemCode}
                  href={`/media/${rating.mediaItemCode}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-stone-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-950">
                      {rating.mediaItemTitle}
                    </span>
                    <span className="mt-1 block text-xs text-stone-500">
                      Обновлено: {formatDate(rating.updatedAt)}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-stone-950">
                    {formatScore(rating.score)}
                  </span>
                </Link>
              ))}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="border-b border-stone-200 px-4 py-3">
            <CardTitle className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">
              Последние рецензии
            </CardTitle>
          </CardHeader>

          {reviewSummary.latestReviews.length === 0 ? (
            <CardContent className="p-4 text-sm text-stone-500">Пока нет рецензий.</CardContent>
          ) : (
            <CardContent className="divide-y divide-stone-200 p-0">
              {reviewSummary.latestReviews.map((review) => (
                <Link
                  key={review.id}
                  href={`/author/reviews/${review.id}/edit`}
                  className="grid gap-2 px-4 py-3 transition-colors hover:bg-stone-100"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={REVIEW_STATUS_BADGE_VARIANTS[review.status]}>
                      {CONTRIBUTION_STATUS_VALUE_LABELS[review.status]}
                    </Badge>
                    <span className="text-xs text-stone-500">
                      Обновлено: {formatDate(review.updatedAt)}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-950">
                      {review.reviewTitle}
                    </span>
                    <span className="mt-1 block truncate text-xs text-stone-500">
                      {review.mediaItemTitle}
                    </span>
                  </span>
                </Link>
              ))}
            </CardContent>
          )}
        </Card>
      </section>
    </div>
  );
}
