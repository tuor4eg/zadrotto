"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";

import { AuthorRatingForm } from "@/app/author-rating-form";
import { formatScore } from "@/lib/rating-score";

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
  hasUnsavedRating: boolean;
  onClose: () => void;
  onScoreChange: (hasUnsaved: boolean) => void;
};

export function RatingStars({ score }: { score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span className="font-mono text-xs tracking-[0.16em] text-stone-900" aria-hidden="true">
      {"★".repeat(filledStars)}
      <span className="text-stone-300">{"★".repeat(5 - filledStars)}</span>
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
  const ratingPanelClassName = isCompact
    ? "group relative block min-w-[82px] rounded-md border border-stone-300/80 bg-stone-50/35 px-3 py-2 text-center transition-colors hover:border-stone-950 hover:bg-stone-100/70"
    : "group relative rounded-md border border-stone-300/80 bg-stone-50/45 p-4 text-center transition-colors hover:border-stone-950 hover:bg-stone-100/70";
  const labelClassName = isCompact
    ? "block font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500"
    : "block font-mono text-xs uppercase tracking-[0.14em] text-stone-500";
  const valueClassName = currentAuthor
    ? isCompact
      ? "mt-1 block font-serif text-3xl tabular-nums text-red-900"
      : "mt-2 block font-serif text-5xl tabular-nums text-red-900"
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
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-950 px-2 py-1 font-mono text-xs text-stone-50 opacity-0 shadow-sm transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100"
      >
        {tooltip}
      </span>
    </>
  );

  if (!currentAuthor) {
    return (
      <Link
        href="/author/login"
        className={ratingPanelClassName}
        aria-label="Войти как автор, чтобы поставить оценку"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </Link>
    );
  }

  return (
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
  );
}

export function MediaItemRatingModal({
  currentAuthor,
  currentAuthorScore,
  formId,
  franchiseCode,
  hasUnsavedRating,
  mediaItemCode,
  onClose,
  onScoreChange,
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
            inlineSaveButton={false}
            onScoreChange={onScoreChange}
            formId={formId}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            form={formId}
            name="intent"
            value="save"
            onClick={onClose}
            className="rounded-md border border-stone-950 bg-stone-950 px-4 py-2 font-mono text-sm text-stone-50 transition-colors hover:bg-stone-50 hover:text-stone-950 disabled:border-stone-300 disabled:bg-stone-50 disabled:text-stone-300"
            disabled={!hasUnsavedRating}
          >
            Сохранить
          </button>
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
  const [hasUnsavedRating, setHasUnsavedRating] = useState(false);

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
          hasUnsavedRating={hasUnsavedRating}
          onClose={() => setIsOpen(false)}
          onScoreChange={setHasUnsavedRating}
        />
      ) : null}
    </>
  );
}
