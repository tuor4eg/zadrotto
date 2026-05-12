import Link from "next/link";

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
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-zinc-200 p-4 sm:col-span-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Автор
          </span>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold text-zinc-950">{author.name}</h2>
          </div>
        </div>

        <div className="border border-zinc-200 p-4">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Оценок
          </span>
          <span className="mt-2 block text-3xl font-semibold tabular-nums text-zinc-950">
            {summary.ratingsCount}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">
            {formatRatingsCount(summary.ratingsCount)}
          </span>
        </div>

        <div className="border border-zinc-200 p-4">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Средняя
          </span>
          <span className="mt-2 block text-3xl font-semibold tabular-nums text-zinc-950">
            {formatScore(summary.averageScore)}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">личная средняя оценка</span>
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <Link
            href="/?mine=rated"
            className="border border-zinc-300 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
          >
            Оцененные мной
          </Link>
          <Link
            href="/?mine=unrated"
            className="border border-zinc-300 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
          >
            Без моей оценки
          </Link>
        </div>
      </section>

      <section className="border border-zinc-200">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            По типам медиа
          </h2>
        </div>
        <div className="divide-y divide-zinc-200">
          {MEDIA_TYPES.map((mediaType) => {
            const count = distributionByMediaType.get(mediaType) ?? 0;

            return (
              <div
                key={mediaType}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-sm"
              >
                <span className="text-zinc-700">{MEDIA_TYPE_LABELS[mediaType]}</span>
                <span className="font-mono text-xs text-zinc-500">{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border border-zinc-200">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Последние оценки
          </h2>
        </div>

        {summary.latestRatings.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">Пока нет оценок.</div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {summary.latestRatings.map((rating) => (
              <Link
                key={rating.mediaItemCode}
                href={`/media/${rating.mediaItemCode}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-zinc-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-950">
                    {rating.mediaItemTitle}
                  </span>
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-zinc-950">
                  {formatScore(rating.score)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
