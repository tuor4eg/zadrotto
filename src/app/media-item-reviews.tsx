import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

type MediaItemReview = {
  id: number;
  authorName: string;
  authorCode: string;
  title: string;
  body: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

type MediaItemReviewsProps = {
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  mediaItemId: number;
  reviews: MediaItemReview[];
};

function formatDate(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "Europe/Moscow",
  }).format(value);
}

export function MediaItemReviews({
  currentAuthor,
  mediaItemId,
  reviews,
}: MediaItemReviewsProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          На соседней полке
        </div>
        {currentAuthor ? (
          <Link
            href={`/author/reviews/new?mediaItemId=${mediaItemId}`}
            className={buttonVariants({ size: "sm" })}
          >
            Написать рецензию
          </Link>
        ) : (
          <Link href="/author/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Войти как автор
          </Link>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="mt-4 px-4 py-5 font-mono text-sm text-stone-500">
          Here be dragons
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {reviews.map((review) => {
            const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);

            return (
              <article
                key={review.id}
                className="rounded-md border border-stone-300/80 bg-stone-50/55 p-4"
              >
                <div className="flex flex-wrap gap-2 font-mono text-xs uppercase tracking-[0.12em] text-stone-500">
                  <span>{review.authorName}</span>
                  {publishedAt ? <span>• {publishedAt}</span> : null}
                </div>
                <h3 className="mt-2 font-serif text-2xl leading-tight text-stone-950">
                  {review.title}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                  {review.body}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
