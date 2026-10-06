"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { AuthorRatingForm } from "@/app/author-rating-form";
import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import {
  AnimeMangaRatingContent,
  BookNoteRatingContent,
  ComicCardRatingContent,
  DosTerminalRatingContent,
  DvdMenuRatingContent,
  FilmStripRatingContent,
  ModernTvGuideRatingContent,
  NesRatingPanelContent,
  Ps1RatingPanelContent,
  RobloxRatingContent,
  RatingStars,
  SteamAchievementRatingContent,
  StreamingRatingContent,
  TvGuideRatingContent,
  VhsRatingPanelContent,
  WinDvdAeroRatingContent,
  Win9xRatingContent,
} from "@/app/media-rating-panel";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { RatingCoachAnchor } from "@/components/onboarding/rating-coach-anchor";
import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences";
import { formatFirstExperiencedDate } from "@/lib/authors/experience-date";
import { MEDIA_IDENTITY_FONT_CLASS_NAME, type MediaCarrierRatingPanelVariant } from "@/lib/media/carrier-frame";
import { formatScore } from "@/lib/ratings/score";
import { RATING_PANEL_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";
import { useDemoMediaOverlay } from "@/lib/user-state/use-demo-media-overlay";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

type MediaItemRatingDialogProps = {
  mediaItemCode: string;
  openRequestKey?: number | null;
  franchiseCode?: string | null;
  title: string;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorFirstExperiencedAt?: Date | string | null;
  currentAuthorFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
  currentAuthorScore: number | null;
  releaseYear?: number | null;
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
    `${RATING_PANEL_TONE_CLASS_NAMES[getRatingTone(currentAuthorScore)]} border-[color:var(--rating-author-border)]`;
  const isDosTerminalPanel = panelVariant === "dos-terminal";
  const isFilmStripPanel = panelVariant === "film-strip";
  const isModernTvGuidePanel = panelVariant === "modern-tv-guide";
  const isVhsPosterPanel = panelVariant === "vhs-poster";
  const isTvGuidePanel = panelVariant === "tv-guide";
  const isWin9xWindowPanel = panelVariant === "win9x-window";
  const isWinDvdAeroPanel = panelVariant === "windvd-aero";
  const isPs1MemoryCardPanel = panelVariant === "ps1-memory-card";
  const isRobloxPlaquePanel = panelVariant === "roblox-plaque";
  const isSteamAchievementPanel = panelVariant === "steam-achievement";
  const isStreamingCardPanel = panelVariant === "streaming-card";
  const isDvdMenuPanel = panelVariant === "dvd-menu";
  const isComicCardPanel = panelVariant === "comic-card";
  const isBookNotePanel = panelVariant === "book-note";
  const isAnimeMangaPanel = panelVariant === "anime-manga";
  const isStandalonePanel =
    isAnimeMangaPanel ||
    isBookNotePanel ||
    isComicCardPanel ||
    isDvdMenuPanel ||
    isDosTerminalPanel ||
    isFilmStripPanel ||
    isModernTvGuidePanel ||
    isTvGuidePanel ||
    isVhsPosterPanel ||
    isSteamAchievementPanel ||
    isStreamingCardPanel ||
    isWin9xWindowPanel ||
    isWinDvdAeroPanel ||
    isRobloxPlaquePanel ||
    isPs1MemoryCardPanel;

  const tooltipClassName = "flex h-full w-full";
  const ratingPanelClassName = isStandalonePanel
    ? "group relative block h-full w-full min-w-0 cursor-pointer rounded-md text-center transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
    : isCompact
      ? `group relative flex h-full w-full min-w-[82px] flex-col items-center justify-start cursor-pointer rounded-md border p-2 text-center transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(28,25,23,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
          currentAuthor
            ? `${authorRatingToneClassName} hover:shadow-[0_10px_22px_rgba(28,25,23,0.24)]`
            : "border-stone-300/80 bg-stone-50/35 text-stone-700 hover:border-stone-950 hover:bg-stone-100/70"
        }`
      : `group relative h-full w-full cursor-pointer rounded-md border p-4 text-center transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(28,25,23,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
          currentAuthor
            ? `${authorRatingToneClassName} hover:shadow-[0_16px_34px_rgba(28,25,23,0.26)]`
            : "border-stone-300/80 bg-stone-50/45 text-stone-700 hover:border-stone-950 hover:bg-stone-100/70"
        }`;
  const labelClassName = `block ${panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} ${isCompact ? "text-[10px]" : "text-xs"} font-semibold uppercase leading-5 ${
    currentAuthor ? "opacity-70" : "text-stone-500"
  }`;
  const valueClassName = currentAuthor
    ? isCompact
      ? `mt-1 block ${panelDisplayClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-3xl tabular-nums`
      : `mt-2 block ${panelDisplayClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-5xl tabular-nums`
    : isCompact
      ? `mt-1 block ${panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-xs uppercase text-red-900`
      : `mt-2 block ${panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-sm uppercase text-red-900`;
  const ratingActionLabel = currentAuthorScore === null ? "Поставить оценку" : "Изменить оценку";
  const tooltip = currentAuthor ? ratingActionLabel : "Войти как автор";
  const content = isAnimeMangaPanel ? (
    <AnimeMangaRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isBookNotePanel ? (
    <BookNoteRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти в аккаунт"}
    />
  ) : isDosTerminalPanel ? (
    <DosTerminalRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix="Знакомство: "
      footer="C:\\USER>"
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      toneSource="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isFilmStripPanel ? (
    <FilmStripRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isVhsPosterPanel ? (
    <VhsRatingPanelContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isTvGuidePanel ? (
    <TvGuideRatingContent
      channel="5"
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isModernTvGuidePanel ? (
    <ModernTvGuideRatingContent
      channel="REN"
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isWin9xWindowPanel ? (
    <Win9xRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isWinDvdAeroPanel ? (
    <WinDvdAeroRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isSteamAchievementPanel ? (
    <SteamAchievementRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isStreamingCardPanel ? (
    <StreamingRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isDvdMenuPanel ? (
    <DvdMenuRatingContent
      compact={isCompact}
      footerLabel="Chapter"
      footerValue={currentAuthor && firstExperiencedDate ? `Знакомство: ${firstExperiencedDate}` : undefined}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isComicCardPanel ? (
    <ComicCardRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isPs1MemoryCardPanel ? (
    <Ps1RatingPanelContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : isRobloxPlaquePanel ? (
    <RobloxRatingContent
      compact={isCompact}
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      label="Моя оценка"
      score={currentAuthor ? currentAuthorScore : null}
      tone="author"
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : panelVariant === "nes-hearts" ? (
    <NesRatingPanelContent
      compact={isCompact}
      compactLabel="Моя оценка"
      detail={currentAuthor ? firstExperiencedDate ?? undefined : undefined}
      detailPrefix={isCompact ? "" : "Знакомство: "}
      displayFontClassName={panelDisplayClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME}
      emptyHelper="чтобы поставить оценку"
      label="Моя оценка"
      labelFontClassName={panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME}
      score={currentAuthor ? currentAuthorScore : null}
      value={currentAuthor ? undefined : "Войти"}
    />
  ) : (
    <>
      <span className={labelClassName}>Моя оценка</span>
      <span className={valueClassName}>{currentAuthor ? formatScore(currentAuthorScore) : "Войти"}</span>
      {!isCompact ? (
        currentAuthor ? (
          <>
            <span className="mt-2 flex justify-center">
              <RatingStars score={currentAuthorScore} />
            </span>
            <span className={`mt-3 block ${panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-xs font-semibold uppercase leading-5 ${firstExperiencedDate ? "opacity-70" : "opacity-0"}`}>
              {firstExperiencedDate ? `Знакомство: ${firstExperiencedDate}` : "—"}
            </span>
          </>
        ) : (
          <span className="mt-3 block text-sm leading-5 text-stone-600">
            чтобы поставить оценку
          </span>
        )
      ) : currentAuthor ? (
        <>
          <span className="mt-1 flex h-5 shrink-0 scale-75 justify-center">
            <RatingStars score={currentAuthorScore} />
          </span>
          <span className={`mt-1 block ${panelLabelClassName ?? MEDIA_IDENTITY_FONT_CLASS_NAME} text-[10px] font-semibold uppercase leading-5 ${firstExperiencedDate ? "opacity-70" : "opacity-0"}`}>
            {firstExperiencedDate ?? "—"}
          </span>
        </>
      ) : null}
    </>
  );

  if (!currentAuthor) {
    return (
      <RatingCoachAnchor>
        <ArchiveTooltip label={tooltip} className={tooltipClassName}>
          <button
            type="button"
            className={ratingPanelClassName}
            aria-label="Войти как автор, чтобы поставить оценку"
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.();
            }}
          >
            {content}
          </button>
        </ArchiveTooltip>
      </RatingCoachAnchor>
    );
  }

  return (
    <RatingCoachAnchor>
      <ArchiveTooltip label={tooltip} className={tooltipClassName}>
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
    </RatingCoachAnchor>
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
  releaseYear,
  title,
}: MediaItemRatingModalProps) {
  return (
    <div
      aria-labelledby="rating-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto bg-stone-950/45 p-4"
      role="dialog"
    >
      <div
        className="rating-dialog-roboto archive-paper archive-panel relative top-[max(1rem,calc(50dvh-250px))] w-full max-w-xl p-5 shadow-2xl sm:top-[max(1rem,calc(50dvh-230px))]"
        style={{ overflow: "visible" }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="rating-dialog-title"
            className="min-w-0 break-words text-xl font-normal uppercase leading-tight text-stone-950 sm:text-2xl"
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
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
            releaseYear={releaseYear}
            variant="archive"
            inlineSaveButton={false}
            showLabel={false}
            showExperienceFields
            formId={formId}
            ratingDialogLayout
            onSaved={onClose}
          />
        </div>
      </div>
    </div>
  );
}

export function MediaItemRatingDialog({
  mediaItemCode,
  openRequestKey,
  franchiseCode,
  title,
  currentAuthor,
  currentAuthorFirstExperiencedAt,
  currentAuthorFirstExperiencedPrecision,
  currentAuthorScore,
  releaseYear,
  panelDisplayClassName,
  panelLabelClassName,
  panelVariant,
  size = "card",
}: MediaItemRatingDialogProps) {
  const router = useRouter();
  const demoProfile = useDemoProfile();
  const hasRealAuthor = Boolean(currentAuthor && currentAuthor.code !== "demo");
  const isDemo = Boolean(
    demoProfile && demoProfile.import.importedAt == null && !hasRealAuthor,
  );
  const demoOverlay = useDemoMediaOverlay(mediaItemCode, currentAuthorScore, null);
  const effectiveScore = hasRealAuthor ? currentAuthorScore : demoOverlay.score;
  const effectiveFirstExperiencedAt = hasRealAuthor
    ? currentAuthorFirstExperiencedAt
    : demoOverlay.firstExperiencedAt;
  const effectiveFirstExperiencedPrecision = hasRealAuthor
    ? currentAuthorFirstExperiencedPrecision
    : demoOverlay.firstExperiencedPrecision;
  const canRate = Boolean(hasRealAuthor || isDemo);
  const [isOpen, setIsOpen] = useState(() => openRequestKey != null && canRate);
  const [isLoginOpen, setIsLoginOpen] = useState(() => openRequestKey != null && !canRate);
  const [openRatingAfterLogin, setOpenRatingAfterLogin] = useState(false);
  const isRatingOpen = isOpen || Boolean(hasRealAuthor && openRatingAfterLogin);


  return (
    <>
      <MediaItemRatingPanel
        mediaItemCode={mediaItemCode}
        franchiseCode={franchiseCode}
        title={title}
        currentAuthor={
          hasRealAuthor
            ? currentAuthor
            : isDemo
              ? { name: "Гость", code: "demo" }
              : null
        }
        currentAuthorFirstExperiencedAt={effectiveFirstExperiencedAt}
        currentAuthorFirstExperiencedPrecision={effectiveFirstExperiencedPrecision}
        currentAuthorScore={effectiveScore}
        onOpen={() => canRate ? setIsOpen(true) : setIsLoginOpen(true)}
        panelDisplayClassName={panelDisplayClassName}
        panelLabelClassName={panelLabelClassName}
        panelVariant={panelVariant}
        size={size}
      />

      {isRatingOpen
        ? createPortal(
            <MediaItemRatingModal
              mediaItemCode={mediaItemCode}
              franchiseCode={franchiseCode}
              title={title}
              currentAuthor={hasRealAuthor ? currentAuthor : null}
              currentAuthorFirstExperiencedAt={effectiveFirstExperiencedAt}
              currentAuthorFirstExperiencedPrecision={effectiveFirstExperiencedPrecision}
              currentAuthorScore={effectiveScore}
              releaseYear={releaseYear}
              formId="media-item-rating-form"
              onClose={() => {
                setIsOpen(false);
                setOpenRatingAfterLogin(false);
              }}
            />,
            document.body,
          )
        : null}
      {isLoginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setIsLoginOpen(false)}
              onSuccess={() => {
                setIsLoginOpen(false);
                setOpenRatingAfterLogin(true);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
