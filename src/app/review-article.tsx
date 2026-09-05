"use client";

import { ArrowLeft, ArrowRight, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import { MediaCarrierDisplayTitle } from "@/app/media-carrier-display-title";
import { ReviewAuthorStars, type MediaItemReview } from "@/app/media-item-reviews";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { Avatar } from "@/components/ui/avatar";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";
import type { MediaType } from "@/lib/media/types";
import { formatScore } from "@/lib/ratings/score";

type ReviewArticleProps = {
  canEdit: boolean;
  mediaItemMeta: string[];
  mediaItemTypeLabel: string;
  nextReviewId: number | null;
  previousReviewId: number | null;
  review: MediaItemReview & {
    mediaItemCarrierCode: string | null;
    mediaItemCode: string;
    mediaItemMediaType: MediaType;
    mediaItemTitle: string;
  };
};

function formatDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).format(date);
}

async function copyUrl(url: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Clipboard API can be unavailable on insecure origins or denied by permissions.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function ReviewArticle({
  canEdit,
  mediaItemMeta,
  mediaItemTypeLabel,
  nextReviewId,
  previousReviewId,
  review,
}: ReviewArticleProps) {
  const [toastMessages, setToastMessages] = useState<ArchiveToast[]>([]);
  const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);
  const mediaCarrierFrame = getMediaCarrierFrame({
    mediaCarrierCode: review.mediaItemCarrierCode,
    mediaType: review.mediaItemMediaType,
  });
  const displayFontClassName = mediaCarrierFrame?.displayFontClassName ?? "font-serif";
  const labelFontClassName = mediaCarrierFrame?.labelFontClassName ?? "font-mono";

  async function shareReview() {
    const shareData = {
      text: `Рецензия на «${review.mediaItemTitle}»`,
      title: review.title,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
          return;
        }
      }
    }

    const copied = await copyUrl(shareData.url);
    setToastMessages([{
      id: `review-share-${Date.now()}`,
      text: copied ? "Ссылка на рецензию скопирована" : "Не удалось скопировать ссылку",
      tone: copied ? "success" : "error",
    }]);
  }

  return (
    <>
      <ArchiveToasts messages={toastMessages} />
      <article className="archive-paper archive-panel archive-stack archive-stack-left relative flex min-h-[calc(100dvh-2rem)] flex-col overflow-visible px-6 pb-3 pt-11 sm:px-10 sm:pb-5 sm:pt-12">
        <header className="relative grid gap-x-7 gap-y-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)] lg:items-baseline lg:gap-x-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clip-transparent-trimmed.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-9 z-30 h-24 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:-right-3 sm:-top-11 sm:h-28 lg:-right-2 lg:-top-14 lg:h-32"
          />

          <div className={`${labelFontClassName} flex min-w-0 items-start gap-3 text-sm leading-7 text-stone-950`}>
            <div className="shrink-0 uppercase">Досье</div>
            <nav aria-label="Хлебные крошки" className="min-w-0 flex-1 text-xs leading-5 text-stone-600">
              <ol className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
                <li><Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/archive?type=${encodeURIComponent(review.mediaItemMediaType)}`}>{mediaItemTypeLabel}</Link></li>
                <li aria-hidden="true" className="text-stone-400">/</li>
                <li><Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/media/${review.mediaItemCode}`}>{review.mediaItemTitle}</Link></li>
                <li aria-hidden="true" className="text-stone-400">/</li>
                <li aria-current="page" className="min-w-0 truncate text-stone-800">Рецензия</li>
              </ol>
            </nav>
          </div>

          <div className="max-w-[880px] pr-16 sm:pr-24">
            <div className={mediaCarrierFrame ? `${displayFontClassName} text-xl leading-[1.5] text-stone-950 sm:text-3xl` : "font-serif text-3xl leading-none text-stone-950 sm:text-5xl"}>
              <MediaCarrierDisplayTitle title={review.mediaItemTitle} frame={mediaCarrierFrame} />
            </div>
          </div>

          <div className={`${labelFontClassName} text-xs leading-6 text-stone-800 lg:col-span-2`}>
            {mediaItemMeta.map((label, index) => (
              <Fragment key={`${label}-${index}`}>
                {index > 0 ? <span className="mx-1.5">•</span> : null}
                <span>{label}</span>
              </Fragment>
            ))}
          </div>
        </header>

        <section className="relative mt-5 flex flex-1 flex-col">
          <div className="relative flex flex-1 flex-col">
            <div className="archive-review-paper relative flex flex-1 flex-col border border-stone-300/70 px-6 pb-28 pt-4 sm:px-10 sm:pb-32 sm:pt-5">
            <div className="flex items-start justify-between gap-4">
              <h1 className="archive-typewriter-text min-w-0 max-w-3xl flex-1 break-words text-2xl font-semibold leading-tight text-stone-950 sm:text-4xl">
                {review.title}
              </h1>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={shareReview}
                  className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/95 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                  aria-label="Поделиться рецензией"
                >
                  <Share2 className="size-4" />
                </button>
                {canEdit ? (
                  <Link
                    href={`/reviews/${review.id}/edit`}
                    className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/95 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                    aria-label="Редактировать рецензию"
                  >
                    <Pencil className="size-4" />
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="archive-typewriter-text mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600 sm:text-sm">
              <Link href={`/users/${review.authorId}`} className="group flex items-center gap-2 rounded-sm hover:text-stone-950">
                <Avatar name={review.authorName} objectKey={review.authorAvatarObjectKey} className="size-8 shrink-0 font-sans text-[10px]" />
                <span className="underline decoration-stone-400/60 underline-offset-2 group-hover:decoration-stone-950">{review.authorName}</span>
              </Link>
              {publishedAt ? <span>{publishedAt}</span> : null}
            </div>
            <div className="mt-4 flex justify-start"><ReviewAuthorStars score={review.authorScore} /></div>
            <div className="mt-8 max-w-4xl">
              <p className="archive-typewriter-text whitespace-pre-wrap text-[15px] leading-8 text-stone-800 sm:text-base sm:leading-9">{review.body}</p>
            </div>
            </div>
            {review.authorScore !== null ? (
              <div className="absolute bottom-4 right-3 z-20 w-48 rotate-[0.8deg] border border-stone-400/20 bg-[#ead8b5] px-4 pb-3 pt-4 text-stone-800 shadow-[0_5px_10px_rgba(68,64,60,0.2)] sm:bottom-6 sm:right-5">
                <span className="absolute left-1/2 top-0 h-5 w-16 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] border border-stone-400/10 bg-[#dfcda8]/90 shadow-sm" aria-hidden="true" />
                <div className="archive-typewriter-text text-sm font-semibold">Оценка автора</div>
                <div className="archive-typewriter-text mt-1 text-right text-xl font-semibold leading-none">{formatScore(review.authorScore)} / 10</div>
              </div>
            ) : null}
          </div>
          {previousReviewId || nextReviewId ? (
            <nav aria-label="Навигация по рецензиям" className="flex shrink-0 items-center gap-3 px-1 pb-1 pt-4">
              {previousReviewId ? (
                <Link
                  href={`/reviews/${previousReviewId}`}
                  className="archive-control-surface inline-flex h-9 items-center gap-2 rounded-md border border-stone-300/80 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-colors hover:border-stone-700 hover:bg-stone-50 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Предыдущая рецензия
                </Link>
              ) : null}
              {nextReviewId ? (
                <Link
                  href={`/reviews/${nextReviewId}`}
                  className="archive-control-surface ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-stone-300/80 px-3 text-right font-mono text-xs font-semibold uppercase tracking-[0.08em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-colors hover:border-stone-700 hover:bg-stone-50 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                >
                  Следующая рецензия
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </article>
    </>
  );
}
