import type { MediaCarrierRatingPanelVariant } from "@/lib/media/carrier-frame";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import {
  AVERAGE_RATING_TONE_CLASS_NAMES,
  AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES,
  AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/ratings/tone";

type RatingStarsProps = {
  score: number | null;
  variant?: "plain" | "terminal";
};

type DosTerminalRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  footer: string;
  label: string;
  score: number | null;
  toneSource?: "average" | "author";
  value?: string;
};

type ArchiveRatingPanelProps = {
  compact?: boolean;
  displayFontClassName: string;
  label: string;
  labelFontClassName: string;
  ratingPanelVariant?: MediaCarrierRatingPanelVariant;
  ratingsCount: number;
  score: number | null;
};

const NES_HEART_PATH = "/mediaCarriers/game/nes/heart.png";
const VHS_ARCHIVE_RATING_BACKGROUND_PATH = "/mediaCarriers/video/rating_all.png";
const VHS_AUTHOR_RATING_BACKGROUND_PATH = "/mediaCarriers/video/rating_my.png";

function RatingStars({ score, variant = "plain" }: RatingStarsProps) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  if (variant === "terminal") {
    return (
      <span className="whitespace-nowrap text-current" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={index < filledStars ? "" : "opacity-40"}>
            [{index < filledStars ? "★" : " "}]
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="font-mono text-2xl leading-none tracking-[0.16em] text-current" aria-hidden="true">
      {"★".repeat(filledStars)}
      <span className="opacity-35">{"★".repeat(5 - filledStars)}</span>
    </span>
  );
}

function RatingHearts({ score }: { score: number | null }) {
  const filledHearts = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span className="flex justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < filledHearts ? "" : "opacity-25 grayscale"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NES_HEART_PATH} alt="" className="h-5 w-auto object-contain" />
        </span>
      ))}
    </span>
  );
}

export function DosTerminalRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  footer,
  label,
  score,
  toneSource = "average",
  value,
}: DosTerminalRatingContentProps) {
  const ratingTone = getRatingTone(score);
  const toneClassName =
    toneSource === "author"
      ? AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES[ratingTone];
  const valueClassName = compact
    ? "text-4xl leading-none sm:text-5xl"
    : "text-6xl leading-none sm:text-7xl";
  const detailText = detail ?? "";

  return (
    <span
      className={`relative flex h-full min-h-[9.5rem] flex-col justify-between overflow-hidden rounded-md border bg-stone-950 px-4 pb-3 pt-4 font-mono ${toneClassName} ${
        compact ? "min-h-[8.25rem]" : ""
      }`}
    >
      <span aria-hidden="true" className="absolute bottom-3 top-3 left-3 w-px bg-current opacity-70" />
      <span aria-hidden="true" className="absolute bottom-3 top-3 right-3 w-px bg-current opacity-70" />
      <span aria-hidden="true" className="absolute bottom-3 left-3 right-3 h-px bg-current opacity-70" />
      <span className="relative z-10 flex items-center gap-2 text-[9px] uppercase leading-4 opacity-85">
        <span aria-hidden="true" className="h-px flex-1 bg-current opacity-70" />
        <span>{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-current opacity-70" />
      </span>
      <span className={`${valueClassName} relative z-10 block text-center tabular-nums`}>
        {value ?? formatScore(score)}
      </span>
      <span className="relative z-10 block text-center text-[10px] leading-4 opacity-85">
        <RatingStars score={score} variant="terminal" />
      </span>
      <span
        className={`relative z-10 block min-h-4 text-center text-[10px] uppercase leading-4 opacity-85 ${
          detailText ? "" : "opacity-0"
        }`}
      >
        {detailText ? `${detailPrefix}${detailText}` : "—"}
      </span>
      <span className="relative z-10 block truncate text-left text-[10px] leading-4 opacity-85">
        {footer} ▬
      </span>
    </span>
  );
}

export function NesRatingPanelContent({
  compact = false,
  compactLabel,
  detail,
  detailPrefix = "",
  displayFontClassName,
  emptyHelper,
  label,
  labelFontClassName,
  score,
  value,
}: {
  compact?: boolean;
  compactLabel?: string;
  detail?: string;
  detailPrefix?: string;
  displayFontClassName: string;
  emptyHelper?: string;
  label: string;
  labelFontClassName: string;
  score: number | null;
  value?: string;
}) {
  const hasValueOverride = value !== undefined;

  return (
    <>
      <span
        className={`${labelFontClassName} block ${
          compact ? "text-[10px]" : "text-xs"
        } uppercase ${hasValueOverride ? "text-stone-500" : "opacity-75"}`}
      >
        {compact ? compactLabel ?? label : label}
      </span>
      <span
        className={
          hasValueOverride
            ? `mt-2 block ${labelFontClassName} ${
                compact ? "text-xs" : "text-sm"
              } uppercase text-red-900`
            : `block ${displayFontClassName} ${
                compact ? "mt-1 text-3xl" : "mt-2 text-5xl"
              } tabular-nums`
        }
      >
        {value ?? formatScore(score)}
      </span>
      {!compact ? (
        hasValueOverride ? (
          emptyHelper ? (
            <span className="mt-3 block text-sm leading-5 text-stone-600">
              {emptyHelper}
            </span>
          ) : null
        ) : (
          <>
            <span className="mt-2 flex justify-center">
              <RatingHearts score={score} />
            </span>
            {detail ? (
              <span className={`mt-3 block ${labelFontClassName} text-[10px] uppercase opacity-75`}>
                {detailPrefix}{detail}
              </span>
            ) : null}
          </>
        )
      ) : !hasValueOverride && detail ? (
        <span
          className={`mt-1 block ${labelFontClassName} text-[9px] uppercase opacity-75`}
        >
          {detailPrefix}{detail}
        </span>
      ) : null}
    </>
  );
}

export function VhsRatingPanelContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
}) {
  const backgroundPath =
    tone === "author" ? VHS_AUTHOR_RATING_BACKGROUND_PATH : VHS_ARCHIVE_RATING_BACKGROUND_PATH;
  const hasValueOverride = value !== undefined;

  return (
    <span
      className={`relative flex overflow-hidden rounded-md border border-stone-950/20 bg-stone-950 text-center text-stone-50 shadow-[0_10px_20px_rgba(28,25,23,0.18)] ${
        compact ? "min-h-[6.25rem] px-3 py-3" : "min-h-[10.5rem] px-5 py-4"
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundPath})` }}
      />
      <span
        aria-hidden="true"
        className={`absolute inset-0 ${
          tone === "author" ? "bg-stone-950/20" : "bg-stone-950/42"
        }`}
      />
      <span className="relative z-10 flex flex-1 flex-col items-center justify-between gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.72)]">
        <span className="media-carrier-font-vhs block text-[10px] font-semibold uppercase leading-4 tracking-[0.14em] text-stone-50/88">
          {label}
        </span>
        <span
          className={`media-carrier-font-vhs block ${
            compact ? "text-4xl" : "text-6xl"
          } leading-none tabular-nums text-stone-50`}
        >
          {value ?? formatScore(score)}
        </span>
        {!compact && !hasValueOverride ? (
          <span className="block text-stone-50">
            <RatingStars score={score} />
          </span>
        ) : null}
        <span
          className={`media-carrier-font-vhs block min-h-4 text-[10px] uppercase leading-4 tracking-[0.08em] text-stone-50/82 ${
            detail ? "" : "opacity-0"
          }`}
        >
          {detail ? `${detailPrefix}${detail}` : "—"}
        </span>
      </span>
    </span>
  );
}

export function ArchiveRatingPanel({
  compact = false,
  displayFontClassName,
  label,
  labelFontClassName,
  ratingPanelVariant,
  ratingsCount,
  score,
}: ArchiveRatingPanelProps) {
  if (ratingPanelVariant === "dos-terminal") {
    return (
      <DosTerminalRatingContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        footer="C:\\ARCHIVE>"
        label={label}
        score={score}
        toneSource="average"
      />
    );
  }

  if (ratingPanelVariant === "nes-hearts") {
    return (
      <div
        className={`rounded-md border text-center ${
          compact ? "p-2" : "p-4"
        } ${AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(score)]}`}
      >
        <NesRatingPanelContent
          compact={compact}
          detail={formatRatingsCount(ratingsCount)}
          displayFontClassName={displayFontClassName}
          label={label}
          labelFontClassName={labelFontClassName}
          score={score}
        />
      </div>
    );
  }

  if (ratingPanelVariant === "vhs-poster") {
    return (
      <VhsRatingPanelContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
        tone="archive"
      />
    );
  }

  return (
    <div
      className={`rounded-md border text-center ${
        compact ? "p-2" : "p-4"
      } ${AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(score)]}`}
    >
      <div className={`${labelFontClassName} text-[10px] uppercase leading-5 opacity-70`}>
        {label}
      </div>
      <div
        className={`${
          compact ? "mt-1 text-3xl" : "mt-2 text-4xl sm:text-5xl"
        } ${displayFontClassName} tabular-nums`}
      >
        {formatScore(score)}
      </div>
      {!compact ? (
        <div className="mt-2 flex justify-center">
          <RatingStars score={score} />
        </div>
      ) : null}
      <div className={`${compact ? "mt-1" : "mt-2"} ${labelFontClassName} text-[10px] uppercase leading-5 opacity-70`}>
        {formatRatingsCount(ratingsCount)}
      </div>
    </div>
  );
}
