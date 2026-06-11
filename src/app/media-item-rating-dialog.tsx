"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

import { AuthorRatingForm } from "@/app/author-rating-form";
import {
  DosTerminalRatingContent,
  NesRatingPanelContent,
  VhsRatingPanelContent,
  WinDvdAeroRatingContent,
  Win9xRatingContent,
} from "@/app/media-rating-panel";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences";
import { formatFirstExperiencedDate } from "@/lib/authors/experience-date";
import type { MediaCarrierRatingPanelVariant } from "@/lib/media/carrier-frame";
import { formatScore } from "@/lib/ratings/score";
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";

type MediaItemRatingDialogProps = {
  mediaItemCode: string;
  franchiseCode?: string | null;
  title: string;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorFirstExperiencedAt?: Date | string | null;
  currentAuthorFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
  currentAuthorScore: number | null;
  panelDisplayClassName?: string;
  panelLabelClassName?: string;
  panelVariant?: MediaCarrierRatingPanelVariant;
  size?: "card" | "compact";
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
  currentAuthorFirstExperiencedAt = null,
  currentAuthorFirstExperiencedPrecision = null,
  currentAuthorScore,
  onOpen,
  panelDisplayClassName,
  panelLabelClassName,
  panelVariant,
  size = "card",
}: MediaItemRatingPanelProps) {
  const isCompact = size === "compact";
  const firstExperiencedDate = formatFirstExperiencedDate(
    currentAuthorFirstExperiencedAt,
    currentAuthorFirstExperiencedPrecision,
  );
  const authorRatingToneClassName =
    AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(currentAuthorScore)];
  const isDosTerminalPanel = panelVariant === "dos-terminal";
  const isVhsPosterPanel = panelVariant === "vhs-poster";
  const isWin9xWindowPanel = panelVariant === "win9x-window";
  const isWinDvdAeroPanel = panelVariant === "windvd-aero";
  const isStandalonePanel =
    isDosTerminalPanel || isVhsPosterPanel || isWin9xWindowPanel || isWinDvdAeroPanel;
  const ratingPanelClassName = isStandalonePanel
    ? "group relative block w-full min-w-[82px] cursor-pointer rounded-md text-center transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
    : isCompact
      ? `group relative block w-full min-w-[82px] cursor-pointer rounded-md border px-3 py-2 text-center transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(28,25,23,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
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
    ? `block ${panelLabelClassName ?? "font-mono tracking-[0.12em]"} text-[10px] uppercase ${
        currentAuthor ? "opacity-75" : "text-stone-500"
      }`
    : `block ${panelLabelClassName ?? "font-mono tracking-[0.14em]"} text-xs uppercase ${
        currentAuthor ? "opacity-75" : "text-stone-500"
      }`;
  const valueClassName = currentAuthor
    ? isCompact
      ? `mt-1 block ${panelDisplayClassName ?? "font-serif"} text-3xl tabular-nums`
      : `mt-2 block ${panelDisplayClassName ?? "font-serif"} text-5xl tabular-nums`
    : isCompact
      ? `mt-1 block ${panelLabelClassName ?? "font-mono tracking-[0.1em]"} text-xs uppercase text-red-900`
      : `mt-2 block ${panelLabelClassName ?? "font-mono tracking-[0.14em]"} text-sm uppercase text-red-900`;
  const ratingActionLabel = currentAuthorScore === null ? "Поставить оценку" : "Изменить оценку";
  const tooltip = currentAuthor ? ratingActionLabel : "Войти как автор";
  const content = isDosTerminalPanel ? (
    <DosTerminalRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix="Знакомство: "
      footer="C:\\USER>"
      label="Ваша оценка"
      score={currentAuthor ? currentAuthorScore : null}
      toneSource="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isVhsPosterPanel ? (
    <VhsRatingPanelContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label={isCompact ? "Моя" : "Ваша оценка"}
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isWin9xWindowPanel ? (
    <Win9xRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label={isCompact ? "Моя оценка" : "Ваша оценка"}
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isWinDvdAeroPanel ? (
    <WinDvdAeroRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label={isCompact ? "Моя оценка" : "Ваша оценка"}
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : panelVariant === "nes-hearts" ? (
    <NesRatingPanelContent
      compact={isCompact}
      compactLabel="Моя"
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      displayFontClassName={panelDisplayClassName ?? "font-serif"}
      emptyHelper="чтобы поставить оценку"
      label="Ваша оценка"
      labelFontClassName={panelLabelClassName ?? "font-mono tracking-[0.14em]"}
      score={currentAuthor ? currentAuthorScore : null}
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : (
    <>
      <span className={labelClassName}>{isCompact ? "Моя" : "Ваша оценка"}</span>
      <span className={valueClassName}>{currentAuthor ? formatScore(currentAuthorScore) : "Войти"}</span>
      {!isCompact ? (
        currentAuthor ? (
          <>
            <span className="mt-2 flex justify-center">
              <RatingStars score={currentAuthorScore} />
            </span>
            {firstExperiencedDate ? (
              <span className={`mt-3 block ${panelLabelClassName ?? "font-mono tracking-[0.12em]"} text-[10px] uppercase opacity-75`}>
                Знакомство: {firstExperiencedDate}
              </span>
            ) : null}
          </>
        ) : (
          <span className="mt-3 block text-sm leading-5 text-stone-600">
            чтобы поставить оценку
          </span>
        )
      ) : currentAuthor && firstExperiencedDate ? (
        <span className={`mt-1 block ${panelLabelClassName ?? "font-mono tracking-[0.08em]"} text-[9px] uppercase opacity-75`}>
          {firstExperiencedDate}
        </span>
      ) : null}
    </>
  );

  if (!currentAuthor) {
    return (
      <ArchiveTooltip label={tooltip} className="w-full">
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
    <ArchiveTooltip label={tooltip} className="w-full">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.();
        }}
        className={ratingPanelClassName}
        aria-label={ratingActionLabel}
      >
        {content}
      </button>
    </ArchiveTooltip>
  );
}

export function MediaItemRatingModal({
  currentAuthor,
  currentAuthorFirstExperiencedAt,
  currentAuthorFirstExperiencedPrecision,
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
      <div
        className="archive-paper archive-panel w-full max-w-xl p-5 shadow-2xl"
        style={{ overflow: "visible" }}
      >
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
          <div className="flex shrink-0 items-center gap-2">
            <ArchiveTooltip label="Сохранить" side="bottom">
              <button
                type="submit"
                form={formId}
                name="intent"
                value="save"
                className="grid size-9 place-items-center rounded-md border border-emerald-950/20 bg-emerald-50/80 text-emerald-950 transition-colors hover:border-emerald-700 hover:bg-emerald-100"
                aria-label="Сохранить"
              >
                <Check className="size-4" />
              </button>
            </ArchiveTooltip>
            <ArchiveTooltip label="Закрыть" side="bottom">
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
                aria-label="Закрыть окно оценки"
              >
                <X className="size-4" />
              </button>
            </ArchiveTooltip>
          </div>
        </div>

        <div className="mt-5">
          <AuthorRatingForm
            mediaItemCode={mediaItemCode}
            franchiseCode={franchiseCode}
            currentAuthor={currentAuthor}
            currentAuthorFirstExperiencedAt={currentAuthorFirstExperiencedAt}
            currentAuthorFirstExperiencedPrecision={currentAuthorFirstExperiencedPrecision}
            currentAuthorScore={currentAuthorScore}
            variant="archive"
            inlineSaveButton={false}
            showLabel={false}
            showExperienceFields
            formId={formId}
            onSaved={onClose}
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
  currentAuthorFirstExperiencedAt,
  currentAuthorFirstExperiencedPrecision,
  currentAuthorScore,
  panelDisplayClassName,
  panelLabelClassName,
  panelVariant,
  size = "card",
}: MediaItemRatingDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <MediaItemRatingPanel
        mediaItemCode={mediaItemCode}
        franchiseCode={franchiseCode}
        title={title}
        currentAuthor={currentAuthor}
        currentAuthorFirstExperiencedAt={currentAuthorFirstExperiencedAt}
        currentAuthorFirstExperiencedPrecision={currentAuthorFirstExperiencedPrecision}
        currentAuthorScore={currentAuthorScore}
        onOpen={() => setIsOpen(true)}
        panelDisplayClassName={panelDisplayClassName}
        panelLabelClassName={panelLabelClassName}
        panelVariant={panelVariant}
        size={size}
      />

      {isOpen
        ? createPortal(
            <MediaItemRatingModal
              mediaItemCode={mediaItemCode}
              franchiseCode={franchiseCode}
              title={title}
              currentAuthor={currentAuthor}
              currentAuthorFirstExperiencedAt={currentAuthorFirstExperiencedAt}
              currentAuthorFirstExperiencedPrecision={currentAuthorFirstExperiencedPrecision}
              currentAuthorScore={currentAuthorScore}
              formId="media-item-rating-form"
              onClose={() => setIsOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
