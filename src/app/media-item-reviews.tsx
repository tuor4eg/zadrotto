"use client";

import { Pencil, Plus, Share2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/common/utils";

type MediaItemReview = {
  id: number;
  authorName: string;
  authorCode: string;
  authorAvatarObjectKey: string | null;
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

type SpineTooltipState = {
  left: number;
  title: string;
  top: number;
};

const BOOK_SPINE_VARIANTS = [
  {
    className: "border-red-950/45 bg-red-900 text-red-50 shadow-red-950/25",
    labelClassName: "bg-red-50/90 text-red-950",
  },
  {
    className: "border-emerald-950/45 bg-emerald-900 text-emerald-50 shadow-emerald-950/25",
    labelClassName: "bg-emerald-50/90 text-emerald-950",
  },
  {
    className: "border-sky-950/45 bg-sky-900 text-sky-50 shadow-sky-950/25",
    labelClassName: "bg-sky-50/90 text-sky-950",
  },
  {
    className: "border-amber-950/45 bg-amber-800 text-amber-50 shadow-amber-950/25",
    labelClassName: "bg-amber-50/90 text-amber-950",
  },
  {
    className: "border-stone-950/45 bg-stone-800 text-stone-50 shadow-stone-950/25",
    labelClassName: "bg-stone-50/90 text-stone-950",
  },
  {
    className: "border-indigo-950/45 bg-indigo-900 text-indigo-50 shadow-indigo-950/25",
    labelClassName: "bg-indigo-50/90 text-indigo-950",
  },
] as const;
const REVIEW_SPINE_TITLE_MAX_LENGTH = 20;
const REVIEW_SPINE_TITLE_SINGLE_LINE_LENGTH = 10;
const REVIEW_SPINE_AUTHOR_MAX_LENGTH = 6;

function getBookSpineVariant(reviewId: number) {
  return BOOK_SPINE_VARIANTS[Math.abs(reviewId) % BOOK_SPINE_VARIANTS.length];
}

function formatReviewSpineTitle(title: string) {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length <= REVIEW_SPINE_TITLE_MAX_LENGTH) {
    return { isTruncated: false, text: trimmedTitle };
  }

  return {
    isTruncated: true,
    text: `${trimmedTitle.slice(0, REVIEW_SPINE_TITLE_MAX_LENGTH - 1).trimEnd()}…`,
  };
}

function getReviewSpineWidthClassName(spineTitle: ReturnType<typeof formatReviewSpineTitle>) {
  if (spineTitle.isTruncated) {
    return "w-16 sm:w-[4.5rem]";
  }

  if (spineTitle.text.length > REVIEW_SPINE_TITLE_SINGLE_LINE_LENGTH) {
    return "w-14 sm:w-16";
  }

  return "w-12 sm:w-14";
}

function formatReviewSpineAuthor(authorName: string) {
  const parts = authorName.trim().split(/\s+/).filter(Boolean);
  const firstPart = parts[0] ?? authorName.trim();

  if (firstPart.length <= REVIEW_SPINE_AUTHOR_MAX_LENGTH) {
    return firstPart;
  }

  const initials = parts.map((part) => part[0]).join("");

  return initials.slice(0, REVIEW_SPINE_AUTHOR_MAX_LENGTH).toUpperCase();
}

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
        className="relative flex max-h-[calc(100vh-2.5rem)] w-full max-w-5xl flex-col gap-2"
      >
        <div className="flex shrink-0 justify-end gap-2">
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

        <span className="sr-only" aria-live="polite">{shareStatus}</span>

        <div className="grid h-[calc(100dvh-5.75rem)] max-h-[calc(100vh-5.75rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-stone-300/80 bg-[linear-gradient(90deg,rgba(120,113,108,0.12),transparent_48%,rgba(120,113,108,0.18)_50%,transparent_52%,rgba(120,113,108,0.12)),linear-gradient(135deg,#fffdf5,#f3ead6)] shadow-2xl shadow-stone-950/35 lg:h-[min(620px,calc(100vh-5.75rem))] lg:grid-cols-2 lg:grid-rows-1 lg:gap-0">
          <section className="min-h-0 overflow-hidden border-stone-300/70 p-5 sm:p-7 lg:border-r lg:p-9">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              Рецензия
            </div>
            <h2 id={titleId} className="mt-3 font-serif text-4xl leading-none text-stone-950 sm:text-5xl">
              {review.title}
            </h2>
            <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-stone-500">
              <Avatar
                name={review.authorName}
                objectKey={review.authorAvatarObjectKey}
                className="size-8 font-sans text-[10px]"
              />
              <span>{review.authorName}</span>
              {publishedAt ? <span>{publishedAt}</span> : null}
            </div>
            <div className="mt-8 hidden h-px bg-stone-300/80 lg:block" />
          </section>

          <section className="archive-scrollbar min-h-0 touch-pan-y overflow-y-auto overscroll-contain border-t border-stone-300/70 p-5 sm:p-7 lg:h-full lg:border-t-0 lg:p-9">
            <p className="whitespace-pre-wrap text-[15px] leading-8 text-stone-800">
              {review.body}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ReviewActionBook({
  currentAuthor,
  mediaItemId,
}: {
  currentAuthor: MediaItemReviewsProps["currentAuthor"];
  mediaItemId: number;
}) {
  const href = currentAuthor ? `/author/reviews/new?mediaItemId=${mediaItemId}` : "/author/login";
  const ariaLabel = currentAuthor
    ? "Поделиться мнением"
    : "Войти как автор, чтобы поделиться мнением";

  return (
    <ArchiveTooltip label="Поделиться мнением" className="shrink-0 self-end">
      <Link
        href={href}
        className="flex h-48 w-12 shrink-0 items-center justify-center rounded-t-sm border border-dashed border-stone-500/80 bg-stone-50/30 text-stone-600 transition-[background-color,border-color,color,transform] hover:-translate-y-1 hover:border-stone-950 hover:bg-stone-100/70 hover:text-stone-950 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:h-56 sm:w-14"
        aria-label={ariaLabel}
      >
        <Plus className="size-8" aria-hidden="true" />
      </Link>
    </ArchiveTooltip>
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
  const [spineTooltip, setSpineTooltip] = useState<SpineTooltipState | null>(null);
  const hasCurrentAuthorReview = currentAuthor
    ? reviews.some((review) => review.authorCode === currentAuthor.code)
    : false;
  const canShowReviewAction = !currentAuthor || !hasCurrentAuthorReview;

  if (!currentAuthor && reviews.length === 0) {
    return null;
  }

  function showSpineTooltip(
    event: React.FocusEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>,
    title: string,
    isTruncated: boolean,
  ) {
    if (!isTruncated) {
      setSpineTooltip(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const horizontalPadding = 160;

    setSpineTooltip({
      left: Math.min(
        Math.max(rect.left + rect.width / 2, horizontalPadding),
        window.innerWidth - horizontalPadding,
      ),
      title,
      top: rect.top - 8,
    });
  }

  function openReview(review: MediaItemReview) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("review", String(review.id));
    router.push(`${pathname}?${nextSearchParams.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Полка мнений
        </div>
      </div>

      <div className="mt-4 rounded-md border border-stone-300/70 bg-stone-50/45 px-3 pt-5 shadow-inner shadow-stone-950/5">
        <div className="flex min-w-0 items-end gap-1 border-b-[12px] border-stone-800/85 px-1 pb-0">
          {reviews.length > 0 ? (
            <div className="flex min-w-0 max-w-full items-end gap-1 overflow-x-auto">
              {reviews.map((review) => {
                const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);
                const spineAuthor = formatReviewSpineAuthor(review.authorName);
                const spineTitle = formatReviewSpineTitle(review.title);
                const spineWidthClassName = getReviewSpineWidthClassName(spineTitle);
                const variant = getBookSpineVariant(review.id);

                return (
                  <button
                    key={review.id}
                    type="button"
                    onBlur={() => setSpineTooltip(null)}
                    onFocus={(event) =>
                      showSpineTooltip(event, review.title, spineTitle.isTruncated)
                    }
                    onMouseEnter={(event) =>
                      showSpineTooltip(event, review.title, spineTitle.isTruncated)
                    }
                    onMouseLeave={() => setSpineTooltip(null)}
                    onClick={() => openReview(review)}
                    className={cn(
                      "relative flex h-48 shrink-0 cursor-pointer flex-col items-center overflow-hidden rounded-t-sm border px-1 py-2 text-left shadow-lg transition-[filter,transform] hover:-translate-y-1 hover:brightness-110 focus-visible:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 sm:h-56",
                      variant.className,
                      spineWidthClassName,
                    )}
                    aria-label={`Открыть рецензию «${review.title}», автор ${review.authorName}`}
                  >
                    <span
                      className={cn(
                        "w-[calc(100%-0.25rem)] shrink-0 rounded-sm px-1 py-1 text-center font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.06em] shadow-sm sm:text-[10px]",
                        variant.labelClassName,
                      )}
                      title={review.authorName}
                    >
                      {spineAuthor}
                    </span>
                    <span className="my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden text-center [writing-mode:vertical-rl] rotate-180 font-serif text-lg leading-none sm:text-xl">
                      <span>{spineTitle.text}</span>
                    </span>
                    <div className="flex min-h-7 w-[calc(100%-0.25rem)] shrink-0 items-center justify-center rounded-sm border border-current/20 bg-white/18 px-0.5 py-1 text-center font-mono text-[8px] uppercase leading-none tracking-0 text-current/80 sm:text-[9px]">
                      {publishedAt ?? "Рецензия"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {canShowReviewAction ? (
            <ReviewActionBook currentAuthor={currentAuthor} mediaItemId={mediaItemId} />
          ) : null}
        </div>
        <div className="h-5 rounded-b-md bg-[linear-gradient(180deg,rgba(68,64,60,0.28),rgba(68,64,60,0.08))]" />
      </div>

      {spineTooltip ? (
        <span
          role="tooltip"
          className="archive-paper-surface pointer-events-none fixed z-[90] max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-normal rounded-sm border border-stone-500 px-3 py-2 text-center font-mono text-[11px] font-semibold normal-case leading-4 tracking-[0.04em] text-stone-950 shadow-[0_9px_18px_rgba(28,25,23,0.22)] before:absolute before:left-1/2 before:top-full before:size-2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-r before:border-stone-500 before:bg-[rgb(var(--archive-paper-end))] before:content-['']"
          style={{ left: spineTooltip.left, top: spineTooltip.top }}
        >
          {spineTooltip.title}
        </span>
      ) : null}
    </div>
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
