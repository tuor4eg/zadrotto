"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";

import { AuthorRatingForm } from "@/app/author-rating-form";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { formatScore } from "@/lib/rating-score";
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/rating-tone";

type MediaItemRatingDialogProps = {
  mediaItemCode: string;
  franchiseCode?: string | null;
  title: string;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorScore: number | null;
};

type MediaItemRatingPanelProps = MediaItemRatingDialogProps & {
  onOpen?: () => void;
  size?: "card" | "compact";
};

type MediaItemRatingModalProps = MediaItemRatingDialogProps & {
  formId: string;
  onClose: () => void;
};

export function RatingStars({ score }: { score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span className="font-mono text-2xl leading-none tracking-[0.16em] text-current" aria-hidden="true">
      {"★".repeat(filledStars)}
      <span className="opacity-35">{"★".repeat(5 - filledStars)}</span>
    </span>
  );
}

export function MediaItemRatingPanel({
  currentAuthor,
  currentAuthorScore,
  onOpen,
  size = "card",
}: MediaItemRatingPanelProps) {
  const isCompact = size === "compact";
  const authorRatingToneClassName =
    AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(currentAuthorScore)];
  const ratingPanelClassName = isCompact
    ? `group relative block min-w-[82px] cursor-pointer rounded-md border px-3 py-2 text-center transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(28,25,23,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
        currentAuthor
          ? `${authorRatingToneClassName} hover:shadow-[0_10px_22px_rgba(28,25,23,0.24)]`
          : "border-stone-300/80 bg-stone-50/35 text-stone-700 hover:border-stone-950 hover:bg-stone-100/70"
      }`
    : `group relative w-full cursor-pointer rounded-md border p-4 text-center transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(28,25,23,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
        currentAuthor
          ? `${authorRatingToneClassName} hover:shadow-[0_16px_34px_rgba(28,25,23,0.26)]`
          : "border-stone-300/80 bg-stone-50/45 text-stone-700 hover:border-stone-950 hover:bg-stone-100/70"
      }`;
  const labelClassName = isCompact
    ? `block font-mono text-[10px] uppercase tracking-[0.12em] ${
        currentAuthor ? "opacity-75" : "text-stone-500"
      }`
    : `block font-mono text-xs uppercase tracking-[0.14em] ${
        currentAuthor ? "opacity-75" : "text-stone-500"
      }`;
  const valueClassName = currentAuthor
    ? isCompact
      ? "mt-1 block font-serif text-3xl tabular-nums"
      : "mt-2 block font-serif text-5xl tabular-nums"
    : isCompact
      ? "mt-1 block font-mono text-xs uppercase tracking-[0.1em] text-red-900"
      : "mt-2 block font-mono text-sm uppercase tracking-[0.14em] text-red-900";
  const tooltip = currentAuthor ? "Изменить оценку" : "Войти как автор";
  const content = (
    <>
      <span className={labelClassName}>{isCompact ? "Моя" : "Ваша оценка"}</span>
      <span className={valueClassName}>
        {currentAuthor ? formatScore(currentAuthorScore) : "Войти"}
      </span>
      {!isCompact ? (
        currentAuthor ? (
          <span className="mt-2 flex justify-center">
            <RatingStars score={currentAuthorScore} />
          </span>
        ) : (
          <span className="mt-3 block text-sm leading-5 text-stone-600">
            чтобы поставить оценку
          </span>
        )
      ) : null}
    </>
  );

  if (!currentAuthor) {
    return (
      <ArchiveTooltip label={tooltip} className={isCompact ? "shrink-0" : "w-full"}>
        <Link
          href="/author/login"
          className={ratingPanelClassName}
          aria-label="Войти как автор, чтобы поставить оценку"
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </Link>
      </ArchiveTooltip>
    );
  }

  return (
    <ArchiveTooltip label={tooltip} className={isCompact ? "shrink-0" : "w-full"}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.();
        }}
        className={ratingPanelClassName}
        aria-label="Изменить вашу оценку"
      >
        {content}
      </button>
    </ArchiveTooltip>
  );
}

export function MediaItemRatingModal({
  currentAuthor,
  currentAuthorScore,
  formId,
  franchiseCode,
  mediaItemCode,
  onClose,
  title,
}: MediaItemRatingModalProps) {
  return (
    <div
      aria-labelledby="rating-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4"
      role="dialog"
    >
      <div className="archive-paper archive-panel w-full max-w-xl p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              id="rating-dialog-title"
              className="font-serif text-3xl leading-none text-stone-950"
            >
              Ваша оценка
            </div>
            <div className="mt-2 font-mono text-sm uppercase tracking-[0.14em] text-stone-600">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
            aria-label="Закрыть окно оценки"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5">
          <AuthorRatingForm
            mediaItemCode={mediaItemCode}
            franchiseCode={franchiseCode}
            currentAuthor={currentAuthor}
            currentAuthorScore={currentAuthorScore}
            variant="archive"
            autoSubmitOnSelect
            inlineSaveButton={false}
            showLabel={false}
            formId={formId}
          />
        </div>
      </div>
    </div>
  );
}

export function MediaItemRatingDialog({
  mediaItemCode,
  franchiseCode,
  title,
  currentAuthor,
  currentAuthorScore,
}: MediaItemRatingDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <MediaItemRatingPanel
        mediaItemCode={mediaItemCode}
        franchiseCode={franchiseCode}
        title={title}
        currentAuthor={currentAuthor}
        currentAuthorScore={currentAuthorScore}
        onOpen={() => setIsOpen(true)}
      />

      {isOpen ? (
        <MediaItemRatingModal
          mediaItemCode={mediaItemCode}
          franchiseCode={franchiseCode}
          title={title}
          currentAuthor={currentAuthor}
          currentAuthorScore={currentAuthorScore}
          formId="media-item-rating-form"
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
