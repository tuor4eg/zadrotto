import type { MediaCarrierRatingPanelVariant } from "@/lib/media/carrier-frame";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import {
  AVERAGE_DVD_MENU_RATING_TONE_CLASS_NAMES,
  AVERAGE_RATING_TONE_CLASS_NAMES,
  AVERAGE_PS1_RATING_TONE_CLASS_NAMES,
  AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES,
  AVERAGE_WINDVD_RATING_TONE_CLASS_NAMES,
  AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES,
  AUTHOR_DVD_MENU_RATING_TONE_CLASS_NAMES,
  AUTHOR_PS1_RATING_TONE_CLASS_NAMES,
  AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES,
  AUTHOR_WINDVD_RATING_TONE_CLASS_NAMES,
  AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES,
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

type Win9xRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
};

type WinDvdAeroRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
};

type DvdMenuRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  footerLabel: string;
  footerValue?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
};

type FilmStripRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  value?: string;
};

type Ps1RatingPanelContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
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
const VHS_ARCHIVE_RATING_BACKGROUND_PATH = "/mediaCarriers/video/vhs/rating_all.png";
const VHS_AUTHOR_RATING_BACKGROUND_PATH = "/mediaCarriers/video/vhs/rating_my.png";
const PS1_LOGO_PATH = "/mediaCarriers/game/ps1/ps1_logo.png";
const WINDVD_AERO_ICON_PATH = "/mediaCarriers/game/pc/windvd/icon.png";
const WINDVD_AERO_BUTTONS_PATH = "/mediaCarriers/game/pc/windvd/buttons.png";

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

function Ps1RatingStars({ compact = false, score }: { compact?: boolean; score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span
      className={`inline-flex items-center justify-center leading-none text-[#183047] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)] ${
        compact ? "gap-0.5 text-lg" : "gap-1 text-2xl"
      }`}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < filledStars ? "" : "text-stone-950/35"}>
          {index < filledStars ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function Ps1ButtonMarks({ compact = false }: { compact?: boolean }) {
  const marks = [
    {
      className: "text-emerald-700",
      shape: "triangle",
    },
    {
      className: "text-red-800",
      shape: "circle",
    },
    {
      className: "text-[#17355b]",
      shape: "cross",
    },
    {
      className: "text-purple-800",
      shape: "square",
    },
  ] as const;
  const iconClassName = compact ? "size-3" : "size-4";
  const strokeWidth = compact ? 2.6 : 2.8;

  return (
    <span
      className={`flex items-center justify-between ${
        compact ? "px-1" : "px-4"
      }`}
      aria-hidden="true"
    >
      {marks.map((mark) => (
        <span
          key={mark.shape}
          className={`grid place-items-center ${compact ? "size-3.5" : "size-5"} ${mark.className}`}
        >
          <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
            {mark.shape === "triangle" ? <path d="M12 4 4 20h16L12 4Z" strokeLinejoin="round" /> : null}
            {mark.shape === "circle" ? <circle cx="12" cy="12" r="7" /> : null}
            {mark.shape === "cross" ? (
              <>
                <path d="m6 6 12 12" strokeLinecap="round" />
                <path d="M18 6 6 18" strokeLinecap="round" />
              </>
            ) : null}
            {mark.shape === "square" ? <rect x="5" y="5" width="14" height="14" /> : null}
          </svg>
        </span>
      ))}
    </span>
  );
}

function Win9xRatingStars({ className, score, compact = false }: { className?: string; compact?: boolean; score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span
      className={`whitespace-nowrap leading-none ${
        compact ? "text-xl tracking-[0.08em]" : "text-3xl tracking-[0.12em]"
      } ${className ?? ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{index < filledStars ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

export function Win9xRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: Win9xRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const titleBarClassName =
    tone === "author"
      ? "bg-gradient-to-r from-[#005f5f] to-[#078080]"
      : "bg-gradient-to-r from-[#061c86] to-[#163ca8]";
  const panelPaddingClassName = compact ? "flex-1 px-2 pb-2 pt-1.5" : "px-3 pb-3 pt-2";
  const panelJustifyClassName = hasValueOverride ? "justify-center" : "justify-between";
  const valueClassName = compact
    ? hasValueOverride
      ? "max-w-full whitespace-nowrap text-[1.65rem] leading-none"
      : "text-4xl leading-none"
    : "text-6xl leading-none";
  const detailText = detail ?? "";
  const ratingTone = getRatingTone(score);
  const ratingToneClassName =
    tone === "author"
      ? AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES[ratingTone];

  return (
    <span
      className={`media-carrier-font-pc-win9x flex min-h-full flex-col overflow-hidden border border-[#202020] bg-[#d6d2c8] text-center text-[#111] shadow-[0_0_0_1px_#f4f1e8,2px_2px_0_#5f5b54,inset_2px_2px_0_#ffffff,inset_-2px_-2px_0_#7b776f] ${
        compact ? "min-h-[6.25rem]" : "min-h-[10.5rem]"
      }`}
    >
      <span className={`flex items-center justify-between gap-2 px-1 py-1 text-left text-white ${titleBarClassName}`}>
        <span
          className={`block truncate uppercase ${
            compact ? "text-[9px] leading-3" : "text-[11px] leading-4"
          }`}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          className={`grid shrink-0 place-items-center border border-[#1f1f1f] bg-[#c7c3b9] text-[#111] shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_#6f6a62] ${
            compact ? "size-3 text-[9px] leading-none" : "size-5 text-sm leading-none"
          }`}
        >
          ×
        </span>
      </span>
      <span className={`flex flex-col items-center ${panelJustifyClassName} ${panelPaddingClassName} ${ratingToneClassName}`}>
        <span className={`${valueClassName} block tabular-nums`}>
          {value ?? formatScore(score)}
        </span>
        {!hasValueOverride ? (
          <span className={compact ? "mt-1 block" : "mt-2 block"}>
            <Win9xRatingStars compact={compact} score={score} />
          </span>
        ) : null}
        {!hasValueOverride ? (
          <span
            className={`block min-h-5 uppercase ${
              compact ? "mt-1 text-[9px] leading-4" : "mt-3 text-sm leading-5"
            } ${detailText ? "" : "opacity-0"}`}
          >
            {detailText ? `${detailPrefix}${detailText}` : "—"}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function Ps1RatingPanelContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: Ps1RatingPanelContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const valueText = value ?? formatScore(score);
  const ratingTone = getRatingTone(score);
  const valueClassName =
    tone === "author"
      ? AUTHOR_PS1_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_PS1_RATING_TONE_CLASS_NAMES[ratingTone];
  const valueBoxClassName = hasValueOverride
    ? compact
      ? "h-10 w-full max-w-[7.5rem] px-2 text-2xl"
      : "h-[4.15rem] w-full max-w-[10.5rem] px-3 text-5xl"
    : compact
      ? "size-10 text-4xl"
      : "aspect-square w-[4.15rem] text-7xl";

  return (
    <span
      className={`media-carrier-font-ps1 relative mx-auto block h-full w-full overflow-hidden rounded-[1.15rem] border border-stone-950/28 bg-[linear-gradient(180deg,#cfc5b4_0%,#b9ad9a_52%,#a4937d_100%)] text-stone-950 shadow-[0_10px_18px_rgba(28,25,23,0.28),inset_2px_2px_0_rgba(255,255,255,0.24),inset_-2px_-2px_0_rgba(61,48,35,0.22)] ${
        compact ? "min-h-[6.25rem] max-w-[10rem] px-2 py-2" : "min-h-[10.5rem] max-w-[15.5rem] px-3 py-3"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-multiply [background-image:linear-gradient(90deg,rgba(92,73,52,0.12)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:9px_9px]"
      />
      <span className="relative z-10 flex h-full flex-col justify-between gap-2">
        <span className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PS1_LOGO_PATH}
            alt=""
            className={compact ? "h-5 w-auto shrink-0" : "h-7 w-auto shrink-0"}
            aria-hidden="true"
          />
          <span
            className={`block flex-1 text-center uppercase leading-tight ${
              compact ? "text-[9px]" : "text-[13px]"
            }`}
          >
            {label}
          </span>
        </span>

        <span className="relative flex items-center justify-center">
          <span className={`absolute left-0 grid gap-0.5 ${compact ? "hidden" : ""}`} aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className="block h-0.5 w-5 rounded-full bg-stone-700/62 shadow-[0_1px_0_rgba(255,255,255,0.35)]" />
            ))}
          </span>
          <span
            className={`grid place-items-center rounded-sm border border-stone-950/55 bg-[#090c0b] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.06),inset_0_0_18px_rgba(0,0,0,0.7)] ${
              valueBoxClassName
            } ${valueClassName} leading-none tabular-nums`}
          >
            {valueText}
          </span>
        </span>

        {!hasValueOverride ? (
          <span className="block text-center">
            <Ps1RatingStars compact={compact} score={score} />
          </span>
        ) : null}

        <span
          className={`block min-h-4 text-center uppercase text-stone-700 ${
            compact ? "text-[8px] leading-3" : "text-[10px] leading-4"
          } ${detailText && !hasValueOverride ? "" : "opacity-0"}`}
        >
          {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
        </span>

        <Ps1ButtonMarks compact={compact} />
      </span>
    </span>
  );
}

function WinDvdAeroRatingMarks({
  compact = false,
  score,
  toneClassName,
}: {
  compact?: boolean;
  score: number | null;
  toneClassName: string;
}) {
  const filledMarks = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span
      className={`whitespace-nowrap leading-none ${compact ? "text-xl tracking-[0.06em]" : "text-3xl tracking-[0.1em]"}`}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < filledMarks ? `${toneClassName} drop-shadow-[0_1px_0_rgba(255,255,255,0.78)]` : "text-slate-400/70"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function DvdMenuRatingStars({ compact = false, score }: { compact?: boolean; score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span
      className={`inline-flex items-center justify-center leading-none ${
        compact ? "gap-0.5 text-2xl" : "gap-1 text-4xl"
      }`}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={
            index < filledStars
              ? "text-slate-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.82)]"
              : "text-stone-400/70 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]"
          }
        >
          {index < filledStars ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function FilmStripPerforations({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex w-full justify-between ${compact ? "px-2" : "px-3"}`}
    >
      {Array.from({ length: 8 }, (_, index) => (
        <span
          key={index}
          className={`block rounded-[1px] bg-[#e8d9b8] shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_0_2px_rgba(0,0,0,0.55)] ${
            compact ? "h-2 w-2" : "h-3 w-3"
          }`}
        />
      ))}
    </span>
  );
}

function FilmStripRatingStars({ compact = false, score }: { compact?: boolean; score: number | null }) {
  const filledStars = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <span
      className={`inline-flex items-center justify-center text-[#1b1712] ${
        compact ? "gap-0.5 text-base" : "gap-1.5 text-3xl"
      }`}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{index < filledStars ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

export function FilmStripRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  value,
}: FilmStripRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";

  return (
    <span
      className={`relative mx-auto flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-[#21170e] bg-[#15120d] text-center text-[#23150d] shadow-[0_12px_22px_rgba(28,25,23,0.24),inset_0_0_0_1px_rgba(255,255,255,0.12)] ${
        compact ? "min-h-[5.25rem] p-1" : "min-h-[8rem] max-w-[14.5rem] p-2"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.14)_0_1px,transparent_1px),radial-gradient(circle_at_72%_64%,rgba(255,255,255,0.1)_0_1px,transparent_1px)] [background-size:7px_7px,11px_11px]"
      />
      <span className={`relative z-10 flex h-full min-w-0 flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
        <span className="flex items-center justify-between px-1 text-[8px] leading-none text-[#d0ad62]">
          <span>11A ▶</span>
          <span>12</span>
        </span>
        <FilmStripPerforations compact={compact} />
        <span
          className={`flex min-w-0 flex-1 flex-col items-center justify-between border border-[#6b4a2c]/28 bg-[linear-gradient(180deg,#f1e6c9_0%,#dcc79f_100%)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-12px_22px_rgba(88,49,23,0.08)] ${
            compact ? "px-1.5 py-1.5" : "px-2.5 py-2"
          }`}
        >
          <span
            className={`media-carrier-font-film-reel-label flex w-full min-w-0 items-center gap-2 uppercase text-[#4f2f1d] ${
              compact ? "text-[7px] leading-3" : "text-[10px] leading-4"
            }`}
          >
            <span aria-hidden="true" className="h-px flex-1 bg-[#7a5132]/36" />
            <span className="min-w-0 truncate">{label}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-[#7a5132]/36" />
          </span>
          <span
            className={`media-carrier-font-film-reel block max-w-full leading-none tabular-nums text-[#4a1309] ${
              hasValueOverride
                ? compact
                  ? "text-[1.85rem]"
                  : "text-[2.65rem]"
                : compact
                  ? "text-[3.25rem]"
                  : "text-[4.6rem]"
            }`}
          >
            {value ?? formatScore(score)}
          </span>
          {!hasValueOverride ? (
            <FilmStripRatingStars compact={compact} score={score} />
          ) : (
            <span
              className={`media-carrier-font-film-reel-label uppercase text-[#6d3d24] ${
                compact ? "text-[7px] leading-3" : "text-[9px] leading-4"
              }`}
            >
              чтобы поставить оценку
            </span>
          )}
          <span
            className={`media-carrier-font-film-reel-label block min-h-4 uppercase text-[#6d3d24] ${
              compact ? "text-[6px] leading-3" : "text-[8px] leading-4"
            } ${detailText && !hasValueOverride ? "" : "opacity-0"}`}
          >
            {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
          </span>
        </span>
        <FilmStripPerforations compact={compact} />
        <span className="flex items-center justify-between px-1 text-[8px] leading-none text-[#d0ad62]">
          <span>11A ▶</span>
          <span>{hasValueOverride ? "12" : detailText}</span>
        </span>
      </span>
    </span>
  );
}

export function DvdMenuRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  footerLabel,
  footerValue,
  label,
  score,
  tone,
  value,
}: DvdMenuRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const footerText = footerValue ?? (detailText ? `${detailPrefix}${detailText}` : "");
  const ratingTone = getRatingTone(score);
  const ratingToneClassName =
    tone === "author"
      ? AUTHOR_DVD_MENU_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_DVD_MENU_RATING_TONE_CLASS_NAMES[ratingTone];

  return (
    <span
      className={`media-carrier-font-film-dvd relative mx-auto block h-full w-full overflow-hidden rounded-md border border-slate-500/45 bg-[linear-gradient(180deg,#f2f3f1_0%,#e7e8e6_48%,#d9dad7_100%)] text-slate-700 shadow-[0_10px_18px_rgba(15,23,42,0.18),inset_1px_1px_0_rgba(255,255,255,0.88),inset_-1px_-1px_0_rgba(71,85,105,0.18)] ${
        compact ? "min-h-[6.25rem] max-w-[13rem] p-1.5" : "min-h-[10.5rem] max-w-[17rem] p-2"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.72)_1px,transparent_1px)] [background-size:8px_8px]"
      />
      <span className="relative z-10 flex h-full flex-col gap-1.5">
        <span
          className={`flex items-center gap-2 border-b border-slate-400/55 px-1 uppercase ${
            compact ? "pb-1 text-[9px] leading-3" : "pb-1.5 text-xs leading-4"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-0 w-0 border-y-transparent border-l-slate-700 ${
              compact ? "border-y-[0.25rem] border-l-[0.42rem]" : "border-y-[0.34rem] border-l-[0.58rem]"
            }`}
          />
          <span className="block flex-1 truncate tracking-[0.08em]">{label}</span>
          <span className="shrink-0 text-[0.78em] tracking-[0.1em] text-slate-500">MENU</span>
        </span>

        <span
          className={`flex flex-1 flex-col items-center justify-between rounded border border-slate-400/55 bg-[linear-gradient(180deg,rgba(250,250,248,0.92),rgba(229,230,226,0.72))] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-12px_22px_rgba(148,163,184,0.12)] ${
            compact ? "px-2 py-1.5" : "px-3 py-2"
          }`}
        >
          <span
            className={`block font-bold leading-none tabular-nums drop-shadow-[0_1px_0_rgba(255,255,255,0.82)] ${
              hasValueOverride
                ? compact
                  ? "text-lg"
                  : "text-2xl"
                : compact
                  ? "text-5xl"
                  : "text-7xl"
            } ${ratingToneClassName}`}
          >
            {value ?? formatScore(score)}
          </span>
          {!hasValueOverride ? (
            <DvdMenuRatingStars compact={compact} score={score} />
          ) : (
            <span className={`${compact ? "text-[9px]" : "text-xs"} uppercase tracking-[0.08em] text-red-900`}>
              чтобы поставить оценку
            </span>
          )}
        </span>

        <span
          className={`flex items-center gap-2 px-1 uppercase tracking-[0.08em] text-slate-600 ${
            compact ? "text-[8px] leading-3" : "text-[10px] leading-4"
          }`}
        >
          <span
            aria-hidden="true"
            className={
              tone === "author"
                ? `h-0 w-0 border-y-transparent border-l-slate-600 ${
                    compact ? "border-y-[0.32rem] border-l-[0.56rem]" : "border-y-[0.42rem] border-l-[0.72rem]"
                  }`
                : `grid shrink-0 place-items-center rounded-full border border-slate-400 bg-[radial-gradient(circle_at_36%_34%,#f8fafc_0%,#d4d8d8_45%,#a7adb1_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${
                    compact ? "size-4" : "size-6"
                  }`
            }
          >
            {tone === "archive" ? (
              <span className={`rounded-full border border-slate-500/50 ${compact ? "size-1" : "size-1.5"}`} />
            ) : null}
          </span>
          <span className="shrink-0">{footerLabel}</span>
          <span className={`min-w-0 flex-1 truncate text-right ${footerText && !hasValueOverride ? "" : "opacity-0"}`}>
            {footerText && !hasValueOverride ? footerText : "—"}
          </span>
        </span>
      </span>
    </span>
  );
}

export function WinDvdAeroRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: WinDvdAeroRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const ratingTone = getRatingTone(score);
  const ratingToneClassName =
    tone === "author"
      ? AUTHOR_WINDVD_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_WINDVD_RATING_TONE_CLASS_NAMES[ratingTone];
  const valueBoxClassName = hasValueOverride
    ? compact
      ? "h-14 w-full max-w-[5.75rem] px-1 text-[1.75rem]"
      : "h-20 w-full max-w-[12rem] px-3 text-5xl"
    : compact
      ? "size-14 text-4xl"
      : "size-20 text-6xl";
  const contentJustifyClassName = hasValueOverride
    ? compact
      ? "justify-center"
      : "justify-start"
    : "justify-between";

  return (
    <span
      className={`media-carrier-font-pc-windvd flex h-full flex-col overflow-hidden rounded-xl border border-sky-900/30 bg-[linear-gradient(180deg,rgba(235,249,255,0.94),rgba(210,229,240,0.86))] text-left text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur ${
        compact ? "min-h-[6.25rem]" : "min-h-[10.5rem]"
      }`}
    >
      <span className="flex items-center gap-2 border-b border-sky-700/25 bg-[linear-gradient(180deg,rgba(235,249,255,0.95),rgba(92,156,202,0.72)_52%,rgba(220,239,250,0.92))] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WINDVD_AERO_ICON_PATH}
          alt=""
          className={compact ? "size-4 shrink-0" : "size-6 shrink-0"}
          aria-hidden="true"
        />
        <span
          className={`block min-w-0 flex-1 uppercase text-slate-900 ${
            compact ? "text-[8px] leading-3" : "truncate text-xs"
          }`}
        >
          {label}
        </span>
        {!compact ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={WINDVD_AERO_BUTTONS_PATH}
            alt=""
            className="h-5 w-auto shrink-0 self-start"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className={compact ? "flex flex-1 px-1.5 pb-1.5 pt-0" : "flex flex-1 px-2 pb-2 pt-0"}>
        <span
          className={`flex min-h-0 flex-1 flex-col items-center rounded-lg border border-sky-700/24 bg-transparent text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.46)] ${
            compact ? "px-1.5 py-2" : "px-3 py-3"
          } ${contentJustifyClassName}`}
        >
        <span className="flex w-full flex-col items-center">
          <span
            className={`grid place-items-center rounded-xl border border-current/35 bg-[radial-gradient(circle_at_35%_20%,rgba(255,255,255,0.98)_0%,rgba(226,244,255,0.86)_45%,rgba(125,201,239,0.72)_100%)] shadow-[0_10px_24px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-10px_18px_rgba(3,105,161,0.12)] ${
              valueBoxClassName
            } ${ratingToneClassName} font-semibold leading-none tabular-nums`}
          >
            {value ?? formatScore(score)}
          </span>
          {hasValueOverride ? (
            <span className={`${compact ? "mt-1 text-xs" : "mt-3 text-sm"} uppercase text-red-900`}>
              чтобы поставить оценку
            </span>
          ) : null}
        </span>
        {!hasValueOverride ? (
          <span className={compact ? "mt-1 block" : "mt-2 block"}>
            <WinDvdAeroRatingMarks
              compact={compact}
              score={score}
              toneClassName={ratingToneClassName}
            />
          </span>
        ) : null}
        {!hasValueOverride ? (
          <span
            className={`block min-h-5 uppercase text-slate-800 ${
              compact ? "mt-1 text-[9px] leading-4" : "mt-3 text-sm leading-5"
            } ${detailText ? "" : "opacity-0"}`}
          >
            {detailText ? `${detailPrefix}${detailText}` : "—"}
          </span>
        ) : null}
        </span>
      </span>
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
        className={`relative z-10 block min-h-4 text-center text-[10px] uppercase leading-4 ${
          detailText ? "opacity-85" : "opacity-0"
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
            <span className={`mt-3 block ${labelFontClassName} text-[10px] uppercase ${detail ? "opacity-75" : "opacity-0"}`}>
              {detail ? `${detailPrefix}${detail}` : "—"}
            </span>
          </>
        )
      ) : !hasValueOverride ? (
        <span
          className={`mt-1 block ${labelFontClassName} text-[9px] uppercase ${detail ? "opacity-75" : "opacity-0"}`}
        >
          {detail ? `${detailPrefix}${detail}` : "—"}
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
  if (ratingPanelVariant === "dvd-menu") {
    return (
      <DvdMenuRatingContent
        compact={compact}
        footerLabel="Feature"
        footerValue={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
        tone="archive"
      />
    );
  }

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

  if (ratingPanelVariant === "film-strip") {
    return (
      <FilmStripRatingContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
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

  if (ratingPanelVariant === "ps1-memory-card") {
    return (
      <Ps1RatingPanelContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
        tone="archive"
      />
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

  if (ratingPanelVariant === "win9x-window") {
    return (
      <Win9xRatingContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
        tone="archive"
      />
    );
  }

  if (ratingPanelVariant === "windvd-aero") {
    return (
      <WinDvdAeroRatingContent
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
      className={`h-full rounded-md border text-center ${
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
