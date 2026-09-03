"use client";

import { ArrowRight, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatScore } from "@/lib/ratings/score";

export type MediaItemReview = {
  id: number;
  authorId: number;
  authorName: string;
  authorCode: string;
  authorAvatarObjectKey: string | null;
  authorScore: number | null;
  title: string;
  body: string;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
};

type MediaItemReviewsProps = {
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  mediaItemId: number;
  reviews: MediaItemReview[];
};

function formatDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "2-digit",
  }).format(date);
}

export function ReviewAuthorStars({ compact = false, score }: { compact?: boolean; score: number | null }) {
  const starRating = (score ?? 0) / 20;
  const iconClassName = compact ? "size-3" : "size-6 sm:size-7";
  const starClassName = compact ? "size-3" : "size-6 sm:size-7";

  return (
    <div
      aria-label={score === null ? "Оценка автора не указана" : `Оценка автора: ${formatScore(score)} из 10`}
      className="flex items-center justify-center gap-0.5 text-stone-950"
      role="img"
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fillPercent = Math.max(0, Math.min(100, (starRating - index) * 100));

        return (
          <span key={index} className={`relative ${starClassName}`}>
            <Star className={`absolute inset-0 text-stone-400/70 ${iconClassName}`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
              <Star className={`fill-current ${iconClassName}`} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ReviewQuotePreview({ body }: { body: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);
  const normalizedBody = body.trim();
  const fullText = `«${normalizedBody}»`;
  const [previewText, setPreviewText] = useState(fullText);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (!container || !content) {
      return;
    }

    const fits = (text: string) => {
      content.textContent = text;
      return content.scrollHeight <= container.clientHeight + 1;
    };

    const updatePreview = () => {
      if (container.clientHeight <= 0 || fits(fullText)) {
        setPreviewText(fullText);
        return;
      }

      let lowerBound = 0;
      let upperBound = normalizedBody.length;
      let fittedText = "«…»";

      while (lowerBound <= upperBound) {
        const middle = Math.floor((lowerBound + upperBound) / 2);
        const candidate = `«${normalizedBody.slice(0, middle).trimEnd()}…»`;

        if (fits(candidate)) {
          fittedText = candidate;
          lowerBound = middle + 1;
        } else {
          upperBound = middle - 1;
        }
      }

      content.textContent = fittedText;
      setPreviewText(fittedText);
    };

    updatePreview();
    void document.fonts?.ready.then(updatePreview);
    const resizeObserver = new ResizeObserver(updatePreview);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [fullText, normalizedBody]);

  return (
    <div ref={containerRef} className="relative z-10 min-h-0 flex-1 overflow-hidden text-[10px] leading-[1.5] text-stone-800 sm:text-[11px]">
      <p ref={contentRef}>{previewText}</p>
    </div>
  );
}

function ReviewActionStack({
  currentAuthor,
  hiddenReviewsCount,
  mediaItemId,
}: {
  currentAuthor: MediaItemReviewsProps["currentAuthor"];
  hiddenReviewsCount: number;
  mediaItemId: number;
}) {
  const href = currentAuthor ? `/author/reviews/new?mediaItemId=${mediaItemId}` : "/author/login";
  const ariaLabel = currentAuthor
    ? "Поделиться мнением"
    : "Войти как автор, чтобы поделиться мнением";

  return (
    <div className="relative aspect-square min-w-0">
      <div className="absolute inset-x-1 bottom-0 top-3 rotate-[4deg] border border-stone-300/80 bg-[#f5f0e5] shadow-md" />
      <div className="absolute inset-x-0 bottom-1 top-1 -rotate-[2deg] border border-stone-300/80 bg-[#faf6ec] shadow-md" />
      <div className="absolute inset-0 flex flex-col items-center justify-center border border-stone-300/90 bg-white px-3 text-center shadow-[0_8px_16px_rgba(68,64,60,0.2)]">
        <span className="pointer-events-none absolute inset-[7px] border border-stone-200/80 bg-[#eee6d7] shadow-[inset_0_0_12px_rgba(120,113,108,0.08)]" aria-hidden="true" />
        <Link
          href={href}
          className="group absolute left-1/2 top-1/2 z-10 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-stone-700 transition-[color,transform] hover:scale-110 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950 sm:size-16"
          aria-label={ariaLabel}
        >
          <Plus className="size-10 stroke-[1.5] sm:size-12" aria-hidden="true" />
          <span className="sr-only">Создать новую рецензию</span>
        </Link>
        {hiddenReviewsCount > 0 ? (
          <button
            type="button"
            disabled
            className="absolute inset-x-3 bottom-3 z-10 flex cursor-default items-center justify-center gap-2 font-mono text-[9px] font-semibold leading-4 text-stone-700 sm:text-[10px]"
            aria-label={`Ещё ${hiddenReviewsCount} мнений — переход пока недоступен`}
          >
            <span>Ещё {hiddenReviewsCount} мнений</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MediaItemReviews({
  currentAuthor,
  mediaItemId,
  reviews,
}: MediaItemReviewsProps) {
  if (!currentAuthor && reviews.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Мнения
      </h2>

      <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 px-1 py-3">
        {reviews.slice(0, 3).map((review, index) => {
          const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);

          return (
            <Link
              key={review.id}
              href={`/reviews/${review.id}`}
              className={`archive-typewriter-text relative flex aspect-square min-w-0 cursor-pointer flex-col border border-stone-300/80 bg-white px-4 pb-2.5 pt-4 text-left shadow-[0_7px_14px_rgba(68,64,60,0.18)] transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:px-[18px] sm:pb-2.5 sm:pt-4 ${index % 3 === 1 ? "rotate-[0.8deg]" : index % 3 === 2 ? "-rotate-[0.6deg]" : ""}`}
              aria-label={`Открыть рецензию «${review.title}», автор ${review.authorName}`}
            >
              <span className="pointer-events-none absolute inset-[7px] border border-stone-200/80 bg-[#eee6d7] shadow-[inset_0_0_12px_rgba(120,113,108,0.08)]" aria-hidden="true" />
              <span className="absolute left-1/2 top-0 z-20 h-6 w-16 -translate-x-1/2 -translate-y-1/3 rotate-[-2deg] bg-amber-100/65 shadow-sm" aria-hidden="true" />
              <ReviewQuotePreview body={review.body} />
              <div className="relative z-10 mt-1 shrink-0">
                <div className="mb-1 line-clamp-2 text-[11px] font-semibold leading-4 text-stone-950 sm:text-xs">
                  {review.title}
                </div>
                <div className="flex items-end justify-between gap-2 text-[11px] leading-4 text-stone-600 sm:text-xs">
                  <span className="min-w-0 truncate">{review.authorName}</span>
                  <span className="shrink-0">{publishedAt ?? "Рецензия"}</span>
                </div>
                <div className="mt-0 border-t border-stone-200 pt-0.5">
                  <ReviewAuthorStars compact score={review.authorScore} />
                </div>
              </div>
            </Link>
          );
        })}
        <ReviewActionStack
          currentAuthor={currentAuthor}
          hiddenReviewsCount={Math.max(0, reviews.length - 3)}
          mediaItemId={mediaItemId}
        />
      </div>
    </section>
  );
}
