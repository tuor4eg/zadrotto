"use client";

import { ArrowRight, Pencil, Plus, Share2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { Avatar } from "@/components/ui/avatar";
import { formatScore } from "@/lib/ratings/score";

type MediaItemReview = {
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

type MediaItemReviewLayerProps = Pick<MediaItemReviewsProps, "currentAuthor" | "reviews"> & {
  mediaItemTitle: string;
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

function parseReviewId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const reviewId = Number(value);

  return Number.isSafeInteger(reviewId) && reviewId > 0 ? reviewId : null;
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

function ReviewBookModal({
  currentAuthor,
  mediaItemTitle,
  onClose,
  onLinkCopied,
  review,
}: {
  currentAuthor: MediaItemReviewsProps["currentAuthor"];
  mediaItemTitle: string;
  onClose: () => void;
  onLinkCopied: () => void;
  review: MediaItemReview;
}) {
  const titleId = useId();
  const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);
  const canEditReview = currentAuthor?.code === review.authorCode;
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  async function copyReviewUrl(url: string) {
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

  async function shareReview() {
    const url = new URL(window.location.href);
    url.searchParams.set("review", String(review.id));
    const shareData = {
      text: `Рецензия на «${mediaItemTitle}»`,
      title: review.title,
      url: url.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (
          error !== null &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    }

    const copied = await copyReviewUrl(url.href);
    setShareStatus(copied ? "Ссылка скопирована" : "Не удалось скопировать ссылку");

    if (copied) {
      onLinkCopied();
    }
  }

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-stone-950/55 px-3 py-5 sm:px-5">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть рецензию"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100vh-2.5rem)] w-full max-w-3xl flex-col"
      >
        <span className="sr-only" aria-live="polite">{shareStatus}</span>

        <article className="archive-review-sheet grid h-[calc(100dvh-2.5rem)] max-h-[calc(100vh-2.5rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-stone-300/80 shadow-2xl shadow-stone-950/35 sm:h-[min(760px,calc(100vh-2.5rem))]">
          <header className="relative z-10 px-6 pb-5 pt-7 sm:px-10 sm:pb-6 sm:pt-9">
            <div className="absolute right-4 top-4 flex shrink-0 justify-end gap-2 sm:right-5 sm:top-5">
              <button
                type="button"
                onClick={shareReview}
                className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/95 text-stone-700 shadow-sm transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                aria-label="Поделиться рецензией"
              >
                <Share2 className="size-4" />
              </button>
              {canEditReview ? (
                <Link
                  href={`/author/reviews/${review.id}/edit`}
                  className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/95 text-stone-700 shadow-sm transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                  aria-label="Редактировать рецензию"
                >
                  <Pencil className="size-4" />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/95 text-stone-700 shadow-sm transition-colors hover:border-stone-950 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                aria-label="Закрыть рецензию"
              >
                <X className="size-4" />
              </button>
            </div>
            <h2 id={titleId} className="archive-typewriter-text min-h-9 pr-32 text-2xl font-semibold leading-tight text-stone-950 sm:text-3xl">
              {review.title}
            </h2>
            <div className="archive-typewriter-text mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600 sm:text-sm">
              <Link
                href={`/users/${review.authorId}`}
                className="group flex items-center gap-2 rounded-sm hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
              >
                <Avatar
                  name={review.authorName}
                  objectKey={review.authorAvatarObjectKey}
                  className="size-8 shrink-0 font-sans text-[10px]"
                />
                <span className="underline decoration-stone-400/60 underline-offset-2 transition-colors group-hover:decoration-stone-950">
                  {review.authorName}
                </span>
              </Link>
              {publishedAt ? <span>{publishedAt}</span> : null}
            </div>
            <div className="mt-3 font-serif text-2xl leading-none tracking-[0.14em] text-stone-950 sm:text-3xl" aria-hidden="true">★★★★★</div>
          </header>

          <div className="flex min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
            <section className="archive-review-paper relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden border border-stone-300/70">
              <div className="archive-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-10 py-6 sm:px-14 sm:py-8">
                <p className="archive-typewriter-text whitespace-pre-wrap text-[14px] leading-7 text-stone-800 sm:text-[15px] sm:leading-8">
                  {review.body}
                </p>
              </div>
            </section>
            {review.authorScore !== null ? (
              <div className="relative ml-auto w-48 shrink-0 rotate-[0.8deg] border border-stone-400/20 bg-[#ead8b5] px-4 pb-3 pt-4 text-stone-800 shadow-[0_5px_10px_rgba(68,64,60,0.2)]">
                <span className="absolute left-1/2 top-0 h-5 w-16 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] border border-stone-400/10 bg-[#dfcda8]/90 shadow-sm" aria-hidden="true" />
                <div className="archive-typewriter-text text-sm font-semibold">Оценка автора</div>
                <div className="archive-typewriter-text mt-1 text-right text-xl font-semibold leading-none">
                  {formatScore(review.authorScore)} / 10
                </div>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}

function ReviewActionStack({
  currentAuthor,
  hiddenReviewsCount,
  mediaItemId,
  showCreateAction,
}: {
  currentAuthor: MediaItemReviewsProps["currentAuthor"];
  hiddenReviewsCount: number;
  mediaItemId: number;
  showCreateAction: boolean;
}) {
  const href = currentAuthor ? `/author/reviews/new?mediaItemId=${mediaItemId}` : "/author/login";
  const ariaLabel = currentAuthor
    ? "Поделиться мнением"
    : "Войти как автор, чтобы поделиться мнением";

  return (
    <div className="relative aspect-square w-[116px] shrink-0 sm:w-[164px]">
      <div className="absolute inset-x-1 bottom-0 top-3 rotate-[4deg] border border-stone-300/80 bg-[#f5f0e5] shadow-md" />
      <div className="absolute inset-x-0 bottom-1 top-1 -rotate-[2deg] border border-stone-300/80 bg-[#faf6ec] shadow-md" />
      <div className="absolute inset-0 flex flex-col items-center justify-center border border-stone-300/90 bg-white px-3 text-center shadow-[0_8px_16px_rgba(68,64,60,0.2)]">
        <span className="pointer-events-none absolute inset-[7px] border border-stone-200/80 bg-[#eee6d7] shadow-[inset_0_0_12px_rgba(120,113,108,0.08)]" aria-hidden="true" />
        {showCreateAction ? (
          <Link
            href={href}
            className="group absolute left-1/2 top-1/2 z-10 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-stone-700 transition-[color,transform] hover:scale-110 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950 sm:size-16"
            aria-label={ariaLabel}
          >
            <Plus className="size-10 stroke-[1.5] sm:size-12" aria-hidden="true" />
            <span className="sr-only">Создать новую рецензию</span>
          </Link>
        ) : null}
        {hiddenReviewsCount > 0 ? (
          <button
            type="button"
            disabled
            className={`absolute inset-x-3 z-10 flex cursor-default items-center justify-center gap-2 font-mono text-[9px] font-semibold leading-4 text-stone-700 sm:text-[10px] ${showCreateAction ? "bottom-3" : "top-1/2 -translate-y-1/2 flex-col"}`}
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shelfRef = useRef<HTMLDivElement>(null);
  const [shelfLayout, setShelfLayout] = useState<{
    showActionStack: boolean;
    visibleReviewCount: number;
  } | null>(null);
  const hasCurrentAuthorReview = currentAuthor
    ? reviews.some((review) => review.authorCode === currentAuthor.code)
    : false;
  const canShowReviewAction = !currentAuthor || !hasCurrentAuthorReview;

  useEffect(() => {
    const shelf = shelfRef.current;

    if (!shelf) {
      return;
    }

    const updateVisibleReviewCount = () => {
      const actionWidth = window.innerWidth >= 640 ? 164 : 116;
      const reviewWidth = window.innerWidth >= 640 ? 164 : 148;
      const gap = 12;
      const fullWidthCapacity = Math.max(1, Math.floor((shelf.clientWidth + gap) / (reviewWidth + gap)));
      const showActionStack = canShowReviewAction || reviews.length > fullWidthCapacity;
      const availableWidth = showActionStack
        ? Math.max(0, shelf.clientWidth - actionWidth - gap)
        : shelf.clientWidth;

      setShelfLayout({
        showActionStack,
        visibleReviewCount: Math.max(1, Math.floor((availableWidth + gap) / (reviewWidth + gap))),
      });
    };

    updateVisibleReviewCount();
    const resizeObserver = new ResizeObserver(updateVisibleReviewCount);
    resizeObserver.observe(shelf);

    return () => resizeObserver.disconnect();
  }, [canShowReviewAction, reviews.length]);

  if (!currentAuthor && reviews.length === 0) {
    return null;
  }

  function openReview(review: MediaItemReview) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("review", String(review.id));
    router.push(`${pathname}?${nextSearchParams.toString()}`, { scroll: false });
  }

  return (
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Мнения
      </h2>

      <div
        ref={shelfRef}
        className="mt-4 flex min-h-[172px] min-w-0 items-start gap-3 overflow-hidden px-1 py-3 sm:min-h-[188px]"
      >
        {shelfLayout ? (
          <>
          {reviews.slice(0, shelfLayout.visibleReviewCount).map((review, index) => {
                const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);

                return (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => openReview(review)}
                    className={`archive-typewriter-text relative flex aspect-square w-[148px] shrink-0 cursor-pointer flex-col border border-stone-300/80 bg-white px-4 pb-2.5 pt-4 text-left shadow-[0_7px_14px_rgba(68,64,60,0.18)] transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:w-[164px] sm:px-[18px] sm:pb-2.5 sm:pt-4 ${index % 3 === 1 ? "rotate-[0.8deg]" : index % 3 === 2 ? "-rotate-[0.6deg]" : ""}`}
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
                      <div className="mt-0 flex items-center justify-center gap-[3px] border-t border-stone-200 pt-0.5 font-serif text-[10px] leading-none tracking-[0.08em] text-stone-950 sm:text-xs" aria-hidden="true">
                        ★★★★★
                      </div>
                    </div>
                  </button>
                );
              })}
          {shelfLayout.showActionStack ? (
            <ReviewActionStack
              currentAuthor={currentAuthor}
              hiddenReviewsCount={Math.max(0, reviews.length - shelfLayout.visibleReviewCount)}
              mediaItemId={mediaItemId}
              showCreateAction={canShowReviewAction}
            />
          ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

export function MediaItemReviewLayer({
  currentAuthor,
  mediaItemTitle,
  reviews,
}: MediaItemReviewLayerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewParam = searchParams.get("review");
  const handledInvalidReviewParams = useRef(new Set<string>());
  const [toastMessages, setToastMessages] = useState<ArchiveToast[]>([]);
  const reviewId = parseReviewId(reviewParam);
  const selectedReview = reviewId !== null
    ? reviews.find((review) => review.id === reviewId) ?? null
    : null;

  useEffect(() => {
    if (!reviewParam || selectedReview) {
      return;
    }

    if (!handledInvalidReviewParams.current.has(reviewParam)) {
      handledInvalidReviewParams.current.add(reviewParam);
      setToastMessages([{
        id: `review-not-found-${reviewParam}`,
        text: "Рецензия не найдена",
        tone: "error",
      }]);
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("review");
    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [pathname, reviewParam, router, searchParams, selectedReview]);

  function closeReview() {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("review");
    const queryString = nextSearchParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function showLinkCopiedToast() {
    setToastMessages([{
      id: `review-link-copied-${Date.now()}`,
      text: "Ссылка на рецензию скопирована",
      tone: "success",
    }]);
  }

  return (
    <>
      <ArchiveToasts messages={toastMessages} />
      {selectedReview ? (
        <ReviewBookModal
          currentAuthor={currentAuthor}
          mediaItemTitle={mediaItemTitle}
          onClose={closeReview}
          onLinkCopied={showLinkCopiedToast}
          review={selectedReview}
        />
      ) : null}
    </>
  );
}
