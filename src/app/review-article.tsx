"use client";

import { Heart, LoaderCircle, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { MediaItemReview } from "@/app/media-item-reviews";
import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { ReviewPolaroidRow } from "@/app/reviews/review-polaroid-row";
import { InlineMentionText } from "@/components/inline-mentions/inline-mention-text";
import { ArchiveToasts, type ArchiveToast } from "@/components/ui/archive-toasts";
import { Avatar } from "@/components/ui/avatar";
import type { MediaType } from "@/lib/media/types";
import type { InlineNode, ResolvedInlineEntity } from "@/lib/inline-mentions/markup";
import { formatScore } from "@/lib/ratings/score";
import type { ReviewReactionSummary } from "@/lib/reviews/reactions";

type ReviewArticleProps = {
  authenticated: boolean;
  canEdit: boolean;
  inlineNodes: InlineNode[];
  mediaItemIdentity: React.ReactNode;
  otherAuthorReviews: MediaItemReview[];
  otherMediaItemReviews: MediaItemReview[];
  resolvedInlineEntities: ResolvedInlineEntity[];
  review: MediaItemReview & {
    mediaItemCarrierCode: string | null;
    mediaItemCode: string;
    mediaItemMediaType: MediaType;
    mediaItemTitle: string;
    reactions: ReviewReactionSummary;
  };
};

function formatDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
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
  authenticated,
  canEdit,
  inlineNodes,
  mediaItemIdentity,
  otherAuthorReviews,
  otherMediaItemReviews,
  resolvedInlineEntities,
  review,
}: ReviewArticleProps) {
  const router = useRouter();
  const [toastMessages, setToastMessages] = useState<ArchiveToast[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [reactionPending, setReactionPending] = useState(false);
  const [reactions, setReactions] = useState(review.reactions);
  const publishedAt = formatDate(review.publishedAt ?? review.updatedAt);

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

  async function toggleLike() {
    if (canEdit || reactionPending) return;

    if (!authenticated) {
      setLoginOpen(true);
      return;
    }

    setReactionPending(true);

    try {
      const method = reactions.like.reactedByCurrentUser ? "DELETE" : "PUT";
      const response = await fetch(`/api/reviews/${review.id}/reactions/like`, { method });
      const payload = await response.json() as {
        error?: string;
        reactions?: ReviewReactionSummary;
      };

      if (!response.ok || !payload.reactions) {
        throw new Error(payload.error ?? "Не удалось изменить реакцию.");
      }

      setReactions(payload.reactions);
    } catch (error) {
      setToastMessages([{
        id: `review-reaction-${Date.now()}`,
        text: error instanceof Error ? error.message : "Не удалось изменить реакцию.",
        tone: "error",
      }]);
    } finally {
      setReactionPending(false);
    }
  }

  return (
    <>
      <ArchiveToasts messages={toastMessages} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clip-transparent-trimmed.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-[22px] -top-[13px] z-30 h-24 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:right-7 sm:top-0 sm:h-28 lg:right-8 lg:top-[-12px] lg:h-32"
        />
        <article className="archive-paper archive-panel relative flex flex-1 flex-col px-6 pb-3 pt-11 sm:px-10 sm:pb-5 sm:pt-12">
        {mediaItemIdentity}

        <section className="relative mt-5 flex flex-1 flex-col">
          <div className="relative -mx-6 flex flex-1 flex-col sm:mx-0">
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
            <div className="mt-8 w-full">
              <p className="media-carrier-font-streaming whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-8 text-stone-800 sm:text-base sm:leading-9">
                <InlineMentionText
                  nodes={inlineNodes}
                  resolvedEntities={resolvedInlineEntities}
                />
              </p>
            </div>
              <div className="absolute bottom-5 left-6 z-20 sm:bottom-6 sm:left-10">
                {canEdit ? (
                  <span
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-stone-100/70 px-3 font-mono text-xs tabular-nums text-stone-600"
                    aria-label={`Лайков: ${reactions.like.count}`}
                  >
                    <Heart aria-hidden="true" className="size-4" />
                    {reactions.like.count}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={toggleLike}
                    disabled={reactionPending}
                    aria-pressed={authenticated ? reactions.like.reactedByCurrentUser : undefined}
                    aria-label={authenticated
                      ? reactions.like.reactedByCurrentUser
                        ? "Убрать лайк"
                        : "Поставить лайк"
                      : "Войти, чтобы поставить лайк"}
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 font-mono text-xs tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 disabled:cursor-wait disabled:opacity-65 ${
                      reactions.like.reactedByCurrentUser
                        ? "border-red-900/35 bg-red-900/10 text-red-950"
                        : "border-stone-300/80 bg-stone-50/80 text-stone-700 hover:border-red-900/50 hover:text-red-950"
                    }`}
                  >
                    {reactionPending ? (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Heart
                        aria-hidden="true"
                        className={`size-4 ${reactions.like.reactedByCurrentUser ? "fill-current" : ""}`}
                      />
                    )}
                    {reactions.like.count}
                  </button>
                )}
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
          {otherMediaItemReviews.length > 0 ? (
            <section aria-labelledby="more-media-reviews" className="mt-8 border-t border-stone-300/70 pt-6">
              <h2 id="more-media-reviews" className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                Еще рецензии на{" "}
                <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/media/${review.mediaItemCode}`}>
                  {review.mediaItemTitle}
                </Link>
              </h2>
              <div className="mt-4"><ReviewPolaroidRow mobileScrollable reviews={otherMediaItemReviews} variant="paper" /></div>
            </section>
          ) : null}
          {otherAuthorReviews.length > 0 ? (
            <section aria-labelledby="more-author-reviews" className="mt-8 border-t border-stone-300/70 pt-6">
              <h2 id="more-author-reviews" className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                Еще рецензии автора{" "}
                <Link className="underline decoration-stone-400 underline-offset-4 hover:text-stone-950" href={`/reviews?author=${review.authorId}`}>
                  {review.authorName}
                </Link>
              </h2>
              <div className="mt-4">
                <ReviewPolaroidRow
                  mobileScrollable
                  reviews={otherAuthorReviews}
                  showMediaItemTitle
                  variant="paper"
                />
              </div>
            </section>
          ) : null}
        </section>
        </article>
      </div>
      {loginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setLoginOpen(false)}
              onSuccess={() => {
                setLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
