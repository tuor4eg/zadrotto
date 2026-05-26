import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorRatingSummary } from "@/db/queries/ratings";
import { requireAuthor } from "@/lib/author-auth";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";

export default async function AuthorPage() {
  const author = await requireAuthor();
  const summary = await getAuthorRatingSummary(author.id);
  const distributionByMediaType = new Map(
    summary.distribution.map((item) => [item.mediaType, item.ratingsCount]),
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 lg:grid-cols-[8.5rem_8.5rem_minmax(0,1fr)]">
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
      </section>

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
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-stone-950">
                  {formatScore(rating.score)}
                </span>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
