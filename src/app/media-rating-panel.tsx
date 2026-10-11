import { MEDIA_IDENTITY_FONT_CLASS_NAME, type MediaCarrierRatingPanelVariant } from "@/lib/media/carrier-frame";
import { Bookmark, Lock, PlusCircle } from "lucide-react";
import { formatRatingsCount, formatScore } from "@/lib/ratings/score";
import {
  ARCHIVE_RATING_VALUE_CLASS_NAME,
  AVERAGE_BOOK_NOTE_RATING_TONE_CLASS_NAMES,
  AVERAGE_ANIME_RATING_TONE_CLASS_NAMES,
  AVERAGE_DVD_MENU_RATING_TONE_CLASS_NAMES,
  AVERAGE_COMIC_CARD_RATING_TONE_CLASS_NAMES,
  AVERAGE_MODERN_TV_RATING_TONE_CLASS_NAMES,
  AVERAGE_PS1_RATING_TONE_CLASS_NAMES,
  AVERAGE_STREAMING_RATING_TONE_CLASS_NAMES,
  AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES,
  AVERAGE_WINDVD_RATING_TONE_CLASS_NAMES,
  AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES,
  AUTHOR_BOOK_NOTE_RATING_TONE_CLASS_NAMES,
  AUTHOR_ANIME_RATING_TONE_CLASS_NAMES,
  AUTHOR_DVD_MENU_RATING_TONE_CLASS_NAMES,
  AUTHOR_COMIC_CARD_RATING_TONE_CLASS_NAMES,
  AUTHOR_MODERN_TV_RATING_TONE_CLASS_NAMES,
  AUTHOR_PS1_RATING_TONE_CLASS_NAMES,
  AUTHOR_STREAMING_RATING_TONE_CLASS_NAMES,
  AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES,
  AUTHOR_WINDVD_RATING_TONE_CLASS_NAMES,
  AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES,
  getRatingTone,
  LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES,
  RATING_TEXT_TONE_CLASS_NAMES,
  RATING_PANEL_TONE_CLASS_NAMES,
} from "@/lib/ratings/tone";

type RatingStarsProps = {
  score: number | null;
  variant?: "plain" | "terminal" | "meeple";
};

type AnimeMangaRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
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

type SteamAchievementRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  value?: string;
};

type StreamingRatingContentProps = {
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

type ComicCardRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  tone: "archive" | "author";
  value?: string;
};

type BookNoteRatingContentProps = {
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
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

type TvGuideRatingContentProps = {
  channel: string;
  compact?: boolean;
  detail?: string;
  detailPrefix?: string;
  label: string;
  score: number | null;
  value?: string;
};

type ModernTvGuideRatingContentProps = {
  channel: string;
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
  inverted?: boolean;
  label: string;
  labelFontClassName: string;
  ratingPanelVariant?: MediaCarrierRatingPanelVariant;
  ratingsCount: number;
  score: number | null;
};

const VHS_ARCHIVE_RATING_BACKGROUND_PATH = "/mediaCarriers/video/vhs/rating_all.webp";
const PS1_LOGO_PATH = "/mediaCarriers/game/ps1/ps1_logo.webp";
const WINDVD_AERO_ICON_PATH = "/mediaCarriers/game/pc/windvd/icon.webp";
const WINDVD_AERO_BUTTONS_PATH = "/mediaCarriers/game/pc/windvd/buttons.webp";
const COMIC_ARCHIVE_BURST_PATH = "/mediaCarriers/comic/star.webp";
const COMIC_AUTHOR_BURST_PATH = "/mediaCarriers/comic/bam.webp";
const COMIC_SIGNIN_BURST_PATH = "/mediaCarriers/comic/signin.webp";
const ANIME_ARCHIVE_RATING_ART_PATH = "/mediaCarriers/anime/robot.webp";
const ANIME_AUTHOR_RATING_ART_PATH = "/mediaCarriers/anime/kawai.webp";

export function RatingStars({ score, variant = "plain" }: RatingStarsProps) {
  const starCount = Math.max(0, Math.min(5, (score ?? 0) / 20));
  if (variant === "terminal") {
    const filledStars = Math.round(starCount);
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
    <span className="inline-flex gap-[0.16em] font-mono text-2xl leading-none text-current" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, starCount - index));
        const symbol = variant === "meeple" ? (
          <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]" fill="currentColor" aria-hidden="true" data-rating-symbol="meeple">
            <path d="M12 2a3.4 3.4 0 0 1 3.4 3.4v1.2l4.8 1.8c1.3.5 2 1.5 1.8 2.6-.2 1.2-1.2 2-2.5 2h-2l3 6.9c.4 1-.2 2.1-1.3 2.1h-4.1L12 16.8 8.9 22H4.8c-1.1 0-1.7-1.1-1.3-2.1l3-6.9h-2C3.2 13 2.2 12.2 2 11c-.2-1.1.5-2.1 1.8-2.6l4.8-1.8V5.4A3.4 3.4 0 0 1 12 2Z" />
          </svg>
        ) : "★";
        return (
          <span key={index} className="relative inline-block">
            <span className="opacity-35">{symbol}</span>
            <span className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}>{symbol}</span>
          </span>
        );
      })}
    </span>
  );
}

export function AnimeMangaRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: AnimeMangaRatingContentProps) {
  const toneClassName =
    tone === "archive"
      ? AVERAGE_ANIME_RATING_TONE_CLASS_NAMES[getRatingTone(score)]
      : AUTHOR_ANIME_RATING_TONE_CLASS_NAMES[getRatingTone(score)];
  const artPath =
    tone === "archive" ? ANIME_ARCHIVE_RATING_ART_PATH : ANIME_AUTHOR_RATING_ART_PATH;
  const isSignIn = Boolean(value);
  const footerLabel = tone === "archive" ? "ACTION LEVEL" : isSignIn ? "JOIN THE RANKS" : "PILOT FILE";

  return (
    <span
      className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden border-2 border-black bg-[#f4f0e6] text-black shadow-[3px_4px_0_#111] [clip-path:polygon(0_7px,7px_0,calc(100%_-_5px)_0,100%_5px,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,5px_100%,0_calc(100%_-_5px))] ${
        compact ? "pt-6" : "pt-8"
      }`}
    >
      <span className="absolute left-0 top-0 z-20 size-0 border-b-[13px] border-l-[13px] border-b-transparent border-l-black" />
      <span className="absolute bottom-0 left-0 z-20 size-0 border-l-[13px] border-t-[13px] border-l-black border-t-transparent" />
      <span className="absolute left-4 top-2 z-10 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-black">
        {label}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-6 left-0 object-cover object-left ${
          compact ? "h-[78%] w-full" : "h-[84%] w-full"
        }`}
        src={artPath}
      />
      <span className="pointer-events-none absolute bottom-7 right-3 z-[2] flex -rotate-[18deg] gap-1" aria-hidden="true">
        <span className="h-7 w-1.5 bg-red-700" />
        <span className="h-9 w-1.5 bg-red-700" />
        <span className="h-6 w-1.5 bg-red-700" />
      </span>
      <span className="relative z-[1] flex flex-1 flex-col items-center justify-center px-4 text-center">
        <span className={`${compact ? "text-3xl" : "text-6xl"} block font-black leading-none tabular-nums ${isSignIn ? "text-black" : toneClassName}`}>
          {value ?? formatScore(score)}
        </span>
        {isSignIn ? (
          <span className="mt-1 block max-w-[11rem] font-mono text-[9px] font-bold uppercase leading-3 tracking-[0.08em] text-black">
            чтобы поставить оценку
          </span>
        ) : (
          null
        )}
      </span>
      <span className="relative z-[3] flex min-h-6 items-center justify-between gap-2 border-t-2 border-black bg-[#f4f0e6] px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] text-black">
        <span>{footerLabel}</span>
        <span className="truncate text-right font-bold tracking-normal">
          {detail ? `${detailPrefix}${detail}` : "// 00"}
        </span>
      </span>
    </span>
  );
}

export function BookNoteRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: BookNoteRatingContentProps) {
  const detailText = detail ? `${detailPrefix}${detail}` : null;
  const ratingToneClassName =
    tone === "archive"
      ? AVERAGE_BOOK_NOTE_RATING_TONE_CLASS_NAMES[getRatingTone(score)]
      : AUTHOR_BOOK_NOTE_RATING_TONE_CLASS_NAMES[getRatingTone(score)];
  const hasScore = value === undefined;

  return (
    <div
      className={`relative flex h-full min-h-full flex-col overflow-hidden rounded-md border border-stone-300/80 bg-[#f5ebd9]/92 text-blue-950 shadow-[0_10px_24px_rgba(68,64,60,0.14),inset_0_1px_0_rgba(255,255,255,0.62)] ${
        compact ? "px-3 py-2.5" : "px-5 py-4"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0)_36%),linear-gradient(105deg,rgba(92,64,36,0.06),rgba(255,255,255,0)_34%,rgba(92,64,36,0.07))]"
      />
      <div className={`relative flex items-center ${compact ? "gap-2" : "gap-3"}`}>
        <Bookmark className={compact ? "size-4" : "size-5"} strokeWidth={1.8} />
        <span
          className={`font-mono font-semibold uppercase tracking-[0.18em] ${
            compact ? "text-[0.58rem]" : "text-[0.72rem]"
          }`}
        >
          {label}
        </span>
      </div>

      {hasScore ? (
        <div className={`relative flex flex-1 flex-col items-center justify-center text-center ${compact ? "mt-2" : "mt-4"}`}>
          <div className={`font-serif tabular-nums ${ratingToneClassName} ${compact ? "text-3xl" : "text-6xl leading-none"}`}>
            {formatScore(score)}
          </div>

          <div className={`font-serif text-stone-700 ${compact ? "mt-1 text-xs" : "mt-4 text-sm"}`}>
            {detailText ?? "—"}
          </div>
        </div>
      ) : (
        <div className={`relative flex flex-1 flex-col items-center justify-center text-center ${compact ? "mt-2 gap-2" : "mt-4 gap-4"}`}>
          <div className={`max-w-[13rem] font-serif text-stone-950 ${compact ? "text-xs leading-4" : "text-base leading-5"}`}>
            Войдите, чтобы оставить свою оценку
          </div>
          <span
            className={`inline-flex w-full items-center justify-center rounded-[0.25rem] bg-blue-950 text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ${
              compact ? "min-h-8 px-3 text-xs" : "min-h-10 px-4 text-sm"
            }`}
          >
            {value}
          </span>
        </div>
      )}

      {!compact ? (
        <div className="relative mt-3 flex items-center justify-between border-t border-blue-950/12 pt-3 font-serif text-sm text-blue-950/82">
          <span className="inline-flex items-center gap-2">
            <PlusCircle className="size-5" strokeWidth={1.6} />
            Добавить на полку
          </span>
          <Bookmark className="size-4" strokeWidth={1.6} />
        </div>
      ) : null}
    </div>
  );
}

function ComicBurst({ compact = false, src }: { compact?: boolean; src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`pointer-events-none object-contain drop-shadow-[2px_2px_0_rgba(0,0,0,0.22)] ${
        compact ? "size-12" : "size-[5.1rem]"
      }`}
    />
  );
}

export function ComicCardRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: ComicCardRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const burstPath = hasValueOverride
    ? COMIC_SIGNIN_BURST_PATH
    : tone === "author"
      ? COMIC_AUTHOR_BURST_PATH
      : COMIC_ARCHIVE_BURST_PATH;
  const ratingTone = getRatingTone(score);
  const accentClassName =
    tone === "author" ? "bg-[#d43a28]" : "bg-[#2b90ad]";
  const accentHalftoneClassName =
    "[background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.24)_1px,transparent_1.6px)] [background-size:5px_5px]";
  const titleClassName =
    tone === "author" ? "bg-[#d43a28]" : "bg-[#e7c333]";
  const footerClassName =
    tone === "author" ? "bg-[#e2bd22]" : "bg-[#efe3be]";
  const ratingToneClassName =
    tone === "author"
      ? AUTHOR_COMIC_CARD_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_COMIC_CARD_RATING_TONE_CLASS_NAMES[ratingTone];

  return (
    <span
      className={`media-carrier-font-comic relative mx-auto block h-full w-full overflow-hidden border-2 border-black bg-[#f2e6cd] text-center text-black shadow-[3px_3px_0_rgba(0,0,0,0.24),inset_0_0_0_2px_rgba(255,255,255,0.34)] ${
        compact ? "min-h-[6.25rem] max-w-[13rem]" : "min-h-[10.5rem] max-w-[18rem]"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.16)_1px,transparent_1.5px)] [background-size:6px_6px]"
      />
      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-0 top-0 border-r-2 border-black ${accentClassName} ${accentHalftoneClassName} ${compact ? "w-10" : "w-[4.35rem]"}`}
      />
      <span className={`relative z-10 flex h-full min-w-0 flex-col ${compact ? "pl-10" : "pl-[4.35rem]"}`}>
        <span
          className={`truncate border-b-2 border-black px-2 text-center font-bold uppercase leading-none ${titleClassName} ${
            compact ? "py-1.5 text-[10px]" : "py-2 text-base"
          }`}
        >
          {label}
        </span>
        <span
          className={`relative flex min-w-0 flex-1 items-center justify-center border-b-2 border-black ${
            compact ? "px-2 py-2" : "px-4 py-3"
          }`}
        >
          <span className={`absolute ${compact ? "-left-9 top-1.5" : "-left-[3.95rem] top-3"}`}>
            <ComicBurst compact={compact} src={burstPath} />
          </span>
          {hasValueOverride ? (
            <span className={`block max-w-full font-bold uppercase leading-tight ${compact ? "text-[11px]" : "text-xl"}`}>
              Войдите,
              <br />
              чтобы поставить
              <br />
              оценку
            </span>
          ) : (
            <span className="flex min-w-0 flex-col items-center justify-center">
              <span className={`block leading-none tabular-nums ${ratingToneClassName} ${compact ? "text-5xl" : "text-7xl"}`}>
                {formatScore(score)}
              </span>
            </span>
          )}
        </span>
        <span
          className={`block min-h-5 truncate border-t border-black px-2 font-bold uppercase leading-5 ${footerClassName} ${
            compact ? "text-[10px]" : "text-sm"
          } ${detailText || hasValueOverride ? "" : "opacity-90"}`}
        >
          {hasValueOverride
            ? "Войти в аккаунт"
            : detailText
              ? `${detailPrefix}${detailText}`
              : "—"}
        </span>
      </span>
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
  const valueClassName = hasValueOverride
    ? compact ? "max-w-full whitespace-nowrap text-xs leading-none" : "text-sm leading-none"
    : compact ? "text-3xl leading-none" : "text-4xl leading-none sm:text-5xl";
  const detailText = detail ?? "";
  const ratingTone = getRatingTone(score);
  const ratingToneClassName =
    tone === "author"
      ? AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES[ratingTone]
      : AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES[ratingTone];

  return (
    <span
      className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} flex min-h-full flex-col overflow-hidden border border-[#202020] bg-[#d6d2c8] text-center text-[#111] shadow-[0_0_0_1px_#f4f1e8,2px_2px_0_#5f5b54,inset_2px_2px_0_#ffffff,inset_-2px_-2px_0_#7b776f] ${
        compact ? "min-h-[6.25rem]" : "min-h-[10.5rem]"
      }`}
    >
      <span className={`flex items-center justify-between gap-2 px-1 py-1 text-left text-white ${titleBarClassName}`}>
        <span
          className={`block truncate uppercase ${
            compact ? "text-[10px] leading-3" : "text-xs leading-4"
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
        <span className={`${valueClassName} relative block tabular-nums`}>
          {hasValueOverride ? value : (
            <>

              {formatScore(score)}
            </>
          )}
        </span>

        {!hasValueOverride ? (
          <span
            className={`block min-h-5 uppercase ${
              compact ? "mt-1 text-[10px] leading-5" : "mt-3 text-xs leading-5"
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

function SteamAchievementIcon({
  compact = false,
  displayScore,
  toneClassName,
  valueToneClassName,
}: {
  compact?: boolean;
  displayScore?: string;
  toneClassName: string;
  valueToneClassName: string;
}) {
  const scoreClassName = compact ? "text-3xl" : "text-4xl sm:text-5xl";

  return (
    <span
      className={`grid shrink-0 place-items-center border bg-[radial-gradient(circle_at_50%_42%,rgba(19,41,54,0.82)_0%,rgba(5,13,20,0.98)_70%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_0_22px_rgba(255,255,255,0.08),0_0_14px_rgba(255,255,255,0.08)] ${toneClassName} ${
        compact ? "size-10 self-center" : "size-[4.6rem] self-center"
      }`}
      aria-hidden="true"
    >
      {displayScore !== undefined ? (
        <span
          className={`leading-none tabular-nums ${scoreClassName} ${valueToneClassName}`}
        >
          {displayScore}
        </span>
      ) : (
        <svg
          viewBox="0 0 64 64"
          className={compact ? "size-8" : "size-12"}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="32" cy="22" r="10" />
          <path d="M14 52c3.4-10.4 10-15.6 18-15.6S46.6 41.6 50 52" />
        </svg>
      )}
    </span>
  );
}

export function SteamAchievementRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone = "archive",
  value,
}: SteamAchievementRatingContentProps & { tone?: "archive" | "author" }) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const steamToneClassName = `${RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)]} border-[color:var(--rating-border)]`;

  return (
    <span
      className={`media-carrier-font-pc-steam relative mx-auto flex h-full w-full min-w-0 overflow-hidden border bg-[linear-gradient(180deg,#123144_0%,#0b2230_48%,#081720_100%)] text-left text-slate-200 shadow-[0_10px_22px_rgba(4,13,20,0.26),inset_0_0_0_1px_rgba(125,211,252,0.08)] ${steamToneClassName} ${
        compact
          ? "min-h-[7.5rem] flex-col items-center gap-1.5 px-2 py-2 text-center"
          : "min-h-[10.5rem] max-w-[17.5rem] flex-col items-center px-3 py-3 text-center"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(14,165,233,0.08)_0%,transparent_32%,rgba(14,165,233,0.05)_100%)]"
      />
        <span
          className={`relative z-10 block max-w-full truncate font-semibold uppercase leading-5 opacity-70 ${steamToneClassName} ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          {label}
        </span>
      <span className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <SteamAchievementIcon
          compact={compact}
          displayScore={!hasValueOverride ? formatScore(score) : undefined}
          toneClassName={steamToneClassName}
          valueToneClassName={tone === "archive" ? ARCHIVE_RATING_VALUE_CLASS_NAME : RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)]}
        />
        {hasValueOverride ? (
          <>
            <span className={`block max-w-full text-slate-300 ${compact ? "mt-1 text-[9px] leading-3" : "mt-2 text-xs leading-4"}`}>
              Войдите, чтобы поставить оценку
            </span>
            <span
              className={`mt-2 inline-flex w-fit items-center border bg-[#082231] font-semibold uppercase tracking-[0.08em] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] ${steamToneClassName} ${
                compact ? "px-2 py-1 text-[8px] leading-3" : "px-3 py-1.5 text-[10px] leading-4"
              }`}
            >
              Войти в аккаунт
              <span className="ml-1" aria-hidden="true">›</span>
            </span>
          </>
        ) : null}
      </span>
        {!hasValueOverride ? (
            <span
              className={`relative z-10 block min-h-5 max-w-full font-semibold uppercase leading-5 ${steamToneClassName} ${
                compact ? "text-[10px]" : "text-xs"
              } ${detailText ? "opacity-70" : "opacity-0"}`}
              title={detailText ? `${detailPrefix}${detailText}` : undefined}
            >
              {detailText ? `${detailPrefix}${detailText}` : "—"}
            </span>
        ) : null}
    </span>
  );
}

export function StreamingRatingContent({
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: StreamingRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const toneClassName =
    tone === "archive"
      ? AVERAGE_STREAMING_RATING_TONE_CLASS_NAMES[getRatingTone(score)]
      : AUTHOR_STREAMING_RATING_TONE_CLASS_NAMES[getRatingTone(score)];

  return (
    <span
      className={`media-carrier-font-streaming relative mx-auto flex h-full w-full min-w-0 overflow-hidden rounded-lg border border-white/8 bg-[linear-gradient(180deg,#172023_0%,#101719_52%,#090e10_100%)] text-left text-slate-200 shadow-[0_10px_24px_rgba(4,8,11,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] ${
        compact
          ? "min-h-[7.4rem] max-w-[16rem] flex-col px-3 py-3"
          : "min-h-[11.2rem] max-w-[22rem] flex-col px-5 py-4"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-px ${toneClassName} bg-current shadow-[0_0_16px_currentColor]`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_70%,var(--streaming-rating-glow,rgba(99,102,241,0.18))_0%,transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.045)_0%,transparent_30%)]"
      />
      <span className="relative z-10 flex items-start justify-between gap-3 border-b border-white/6 pb-2">
        <span
          className={`truncate font-semibold uppercase tracking-[0.09em] text-slate-300 ${
            compact ? "text-[9px] leading-3" : "text-xs leading-4"
          }`}
        >
          {label}
        </span>
        {tone === "author" ? (
          <Lock className={`shrink-0 text-slate-400 ${compact ? "size-3" : "size-3.5"}`} strokeWidth={2.4} />
        ) : null}
      </span>

      {hasValueOverride ? (
        <span className="relative z-10 flex min-h-0 flex-1 flex-col">
          <span className={`text-center font-bold text-slate-300 ${compact ? "mt-3 text-2xl" : "mt-4 text-3xl"}`}>
            {value}
          </span>
          <span className={`mt-2 text-center text-slate-400 ${compact ? "text-[9px] leading-3" : "text-xs leading-4"}`}>
            чтобы поставить оценку
          </span>
          <span
            className={`mt-3 block rounded-md bg-indigo-500 text-center font-semibold text-white shadow-[0_8px_18px_rgba(79,70,229,0.24)] ${
              compact ? "px-3 py-1.5 text-[10px] leading-4" : "px-4 py-2 text-sm leading-5"
            }`}
          >
            Войти в аккаунт
          </span>
          <span className={`mt-auto flex items-center justify-between pt-3 text-slate-300 ${compact ? "text-[9px]" : "text-xs"}`}>
            <span className="inline-flex min-w-0 items-center gap-2">
              <PlusCircle className={compact ? "size-3" : "size-4"} strokeWidth={2} />
              <span className="truncate">В мой список</span>
            </span>
            <Bookmark className={compact ? "size-3" : "size-4"} strokeWidth={2} />
          </span>
        </span>
      ) : (
        <span className="relative z-10 flex min-h-0 flex-1 flex-col items-center text-center">
          <span className="flex min-h-0 flex-1 items-center justify-center">
          <span className={`block font-bold tabular-nums ${toneClassName} ${compact ? "text-4xl" : "text-6xl"}`}>
            {formatScore(score)}
          </span>
          </span>

          <span
            className={`block min-h-4 max-w-full truncate font-semibold uppercase tracking-[0.06em] ${toneClassName} ${
              compact ? "mt-1 text-[10px] leading-5" : "mt-2 text-xs leading-5"
            } ${detailText ? "" : "opacity-0"}`}
            title={detailText ? `${detailPrefix}${detailText}` : undefined}
          >
            {detailText ? `${detailPrefix}${detailText}` : "—"}
          </span>
        </span>
      )}
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
  const ratingToneClassName = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)];

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
        <FilmStripPerforations compact={compact} />
        <span
          className={`flex min-w-0 flex-1 flex-col items-center justify-between border border-[#6b4a2c]/28 bg-[linear-gradient(180deg,#f1e6c9_0%,#dcc79f_100%)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-12px_22px_rgba(88,49,23,0.08)] ${
            compact ? "px-0.5 py-1.5" : "px-2.5 py-2"
          }`}
        >
          <span
            className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} flex w-full min-w-0 items-center uppercase ${ratingToneClassName} ${
              compact ? "gap-0.5 text-[10px] leading-3" : "gap-2 text-xs leading-4"
            }`}
          >
            <span aria-hidden="true" className="h-px flex-1 bg-[#7a5132]/36" />
            <span className="min-w-0 truncate">{label}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-[#7a5132]/36" />
          </span>
          <span
            className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} block max-w-full leading-none tabular-nums ${ratingToneClassName} ${
              hasValueOverride
                ? compact
                  ? "text-xs"
                  : "text-sm"
                : compact
                  ? "text-3xl"
                  : "text-4xl sm:text-5xl"
            }`}
          >
            {value ?? formatScore(score)}
          </span>
          {!hasValueOverride ? (
            null
          ) : (
            <span
              className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} uppercase ${ratingToneClassName} ${
                compact ? "text-xs leading-3" : "text-sm leading-4"
              }`}
            >
              чтобы поставить оценку
            </span>
          )}
          <span
            className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} block min-h-4 uppercase ${ratingToneClassName} ${
              compact ? "text-[10px] leading-3" : "text-xs leading-4"
            } ${detailText && !hasValueOverride ? "" : "opacity-0"}`}
          >
            {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
          </span>
        </span>
        <FilmStripPerforations compact={compact} />
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
            null
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
  const valueClassName = hasValueOverride
    ? compact
      ? "text-xs"
      : "text-sm"
    : compact
      ? "text-3xl"
      : "text-4xl sm:text-5xl";
  return (
    <span
      className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} flex h-full flex-col overflow-hidden rounded-xl border border-sky-900/30 bg-[linear-gradient(180deg,rgba(235,249,255,0.94),rgba(210,229,240,0.86))] text-left text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur ${
        compact ? "min-h-[6.25rem]" : "min-h-[10.5rem]"
      }`}
    >
      <span className={`flex items-center border-b border-sky-700/25 bg-[linear-gradient(180deg,rgba(235,249,255,0.95),rgba(92,156,202,0.72)_52%,rgba(220,239,250,0.92))] py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${compact ? "gap-0.5 px-0.5" : "gap-1 px-1"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WINDVD_AERO_ICON_PATH}
          alt=""
          className={compact ? "size-3 shrink-0" : "size-6 shrink-0"}
          aria-hidden="true"
        />
        <span
          className={`block min-w-0 flex-1 whitespace-nowrap uppercase text-slate-900 ${
            compact ? "text-[10px] leading-3" : "truncate text-xs"
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
      <span className={compact ? "flex flex-1 p-1.5" : "flex flex-1 p-2"}>
        <span
          className={`relative min-h-0 flex-1 rounded-lg border border-sky-700/24 bg-transparent text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.46)] ${hasValueOverride ? "flex flex-col items-center justify-center" : "grid grid-rows-[minmax(0,1fr)_auto]"} ${
            compact ? "px-1.5 py-2" : "px-3 py-3"
          }`}
        >
        <span className={hasValueOverride ? "flex w-full flex-col items-center" : "grid min-h-0 place-items-center"}>
          <span
            className={`relative block ${
              valueClassName
            } ${ratingToneClassName} font-semibold leading-none tabular-nums`}
          >
            {hasValueOverride ? value : (
              <>

                {formatScore(score)}
              </>
            )}
          </span>
          {hasValueOverride ? (
            <span className={`${compact ? "mt-1 text-xs" : "mt-3 text-sm"} uppercase text-red-900`}>
              чтобы поставить оценку
            </span>
          ) : null}
        </span>

        {!hasValueOverride ? (
          <span
            className={`block min-h-5 uppercase ${ratingToneClassName} ${
              compact ? "text-[10px] leading-5" : "text-xs leading-5"
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

      <span
        className={`relative z-10 flex h-8 shrink-0 items-center justify-center text-center text-[10px] uppercase leading-4 ${
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
  const ratingToneClassName = RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)];

  return (
    <>
      <span
        className={`${labelFontClassName} ${
          compact ? "block text-[8px] leading-3" : "block text-[10px]"
        } uppercase ${hasValueOverride ? "text-stone-500" : "opacity-75"}`}
      >
        {compact ? compactLabel ?? label : label}
      </span>
      <span
        className={
          hasValueOverride
            ? `mt-2 block ${labelFontClassName} ${
                compact ? "text-[8px]" : "text-[10px]"
              } uppercase text-red-900`
            : `block ${displayFontClassName} ${ratingToneClassName} ${
                compact ? "mt-1 text-2xl leading-none" : "mt-2 text-4xl"
              } tabular-nums`
        }
      >
        {value ?? formatScore(score)}
      </span>
      {!compact ? (
        hasValueOverride ? (
          emptyHelper ? (
            <span className="mt-3 block text-[10px] leading-5 text-stone-600">
              {emptyHelper}
            </span>
          ) : null
        ) : (
          <>
            <span className={`mt-3 block ${labelFontClassName} text-[10px] uppercase ${detail ? "opacity-75" : "opacity-0"}`}>
              {detail ? `${detailPrefix}${detail}` : "—"}
            </span>
          </>
        )
      ) : !hasValueOverride ? (
        <span
          className={`mt-1 block min-h-4 ${labelFontClassName} text-[8px] uppercase leading-4 ${detail ? "opacity-75" : "opacity-0"}`}
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
  const backgroundPath = VHS_ARCHIVE_RATING_BACKGROUND_PATH;
  const ratingToneClassName = RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)];
  const valueToneClassName = tone === "author" ? ratingToneClassName : ARCHIVE_RATING_VALUE_CLASS_NAME;

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
        className="absolute inset-0 bg-stone-950/42"
      />
      <span className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} relative z-10 flex flex-1 flex-col items-center justify-between gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.72)]`}>
        <span className={`block font-semibold uppercase leading-5 opacity-70 ${ratingToneClassName} ${compact ? "text-[10px]" : "text-xs"}`}>
          {label}
        </span>
        <span
          className={`block ${
            value !== undefined
              ? compact ? "text-xs" : "text-sm"
              : compact ? "text-3xl" : "text-4xl sm:text-5xl"
          } leading-none tabular-nums ${value !== undefined ? "text-red-900" : valueToneClassName}`}
        >
          {value ?? formatScore(score)}
        </span>

        <span
          className={`block min-h-5 font-semibold uppercase leading-5 ${ratingToneClassName} ${compact ? "text-[10px]" : "text-xs"} ${
            detail ? "opacity-70" : "opacity-0"
          }`}
        >
          {detail ? `${detailPrefix}${detail}` : "—"}
        </span>
      </span>
    </span>
  );
}

export function ModernTvGuideRatingContent({
  channel,
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  tone,
  value,
}: ModernTvGuideRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const isNumericChannel = /^\d+$/.test(channel);
  const headerClassName =
    tone === "author"
      ? "bg-red-800 text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
      : "bg-blue-900 text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]";
  const scoreClassName =
    tone === "author"
      ? AUTHOR_MODERN_TV_RATING_TONE_CLASS_NAMES[getRatingTone(score)]
      : AVERAGE_MODERN_TV_RATING_TONE_CLASS_NAMES[getRatingTone(score)];
  const cardClassName = `media-carrier-font-modern-tv relative mx-auto block h-full w-full overflow-hidden border border-stone-400/70 bg-[#f4ecdd] text-stone-950 shadow-[0_10px_18px_rgba(28,25,23,0.18),inset_0_1px_0_rgba(255,255,255,0.78)] ${
    compact ? "min-h-[6.25rem] max-w-[14rem] p-1.5" : "min-h-[10.5rem] max-w-[18rem] p-2"
  }`;

  if (compact) {
    return (
      <span className={cardClassName}>
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.54),rgba(255,255,255,0)_42%),radial-gradient(circle_at_20%_8%,rgba(255,255,255,0.42),transparent_30%)]" />
        <span className={`relative z-10 block px-2 py-1 text-center text-[10px] font-bold uppercase leading-none tracking-[0.06em] ${headerClassName}`}>
          {label}
        </span>
        <span className="relative z-10 flex h-[calc(100%-1.45rem)] min-w-0 flex-col justify-between px-1.5 pb-1 pt-1.5">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="text-left text-[10px] font-bold leading-3">
              <span className="block">22:00</span>
              <span className="block text-[9px] font-normal">воскресенье</span>
            </span>
            <span className="grid h-8 w-8 shrink-0 content-center justify-items-center gap-0.5 border border-stone-500/55 bg-stone-50/60 px-0.5 py-1 text-center text-sm font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              {isNumericChannel ? <span className="text-[6px] uppercase leading-none">ТВ</span> : null}
              <span className={`max-w-full truncate ${isNumericChannel ? "text-sm" : "text-[10px]"}`}>
                {channel}
              </span>
              {isNumericChannel ? null : <span className="text-[7px] uppercase leading-none">ТВ</span>}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <span className={`block max-w-full font-bold italic leading-none tabular-nums ${scoreClassName} ${hasValueOverride ? "text-lg" : "text-5xl"}`}>
              {value ?? formatScore(score)}
            </span>
            {!hasValueOverride ? (
              null
            ) : (
              <span className="mt-1.5 block text-[8px] font-bold uppercase">чтобы поставить оценку</span>
            )}
          </span>
          <span className={`block border-t border-dotted border-stone-500/35 pt-1 text-center text-[9px] font-bold uppercase leading-3 ${detailText && !hasValueOverride ? "" : "opacity-0"}`}>
            {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={cardClassName}>
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.58),rgba(255,255,255,0)_38%),radial-gradient(circle_at_18%_8%,rgba(255,255,255,0.5),transparent_28%)]" />
      <span className={`relative z-10 block px-3 py-2 text-center text-base font-bold uppercase leading-none tracking-[0.06em] ${headerClassName}`}>
        {label}
      </span>
      <span className="relative z-10 grid min-h-0 flex-1 grid-cols-[4.3rem_minmax(0,1fr)_3.4rem] px-3 pb-2 pt-3">
        <span className="text-left text-sm font-bold leading-4">
          <span className="block">22:00</span>
          <span className="block text-xs font-normal">воскресенье</span>
        </span>
        <span className="flex min-w-0 flex-col items-center justify-center text-center">
          <span className={`block max-w-full font-bold italic leading-none tabular-nums ${scoreClassName} ${hasValueOverride ? "text-2xl" : "text-7xl"}`}>
            {value ?? formatScore(score)}
          </span>
          {!hasValueOverride ? (
            null
          ) : (
            <span className="mt-2 block text-[10px] font-bold uppercase">чтобы поставить оценку</span>
          )}
        </span>
        <span className="flex justify-end border-l border-dotted border-stone-500/45 pl-2">
          <span className="grid h-12 w-10 content-center justify-items-center gap-0.5 border border-stone-500/65 bg-stone-50/68 px-0.5 py-1.5 text-center text-xl font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            {isNumericChannel ? <span className="text-[7px] uppercase leading-none">ТВ</span> : null}
            <span className={`max-w-full truncate ${isNumericChannel ? "text-xl" : "text-xs"}`}>
              {channel}
            </span>
            {isNumericChannel ? null : <span className="text-[8px] uppercase leading-none">ТВ</span>}
          </span>
        </span>
      </span>
      <span className={`relative z-10 mx-3 block border-t border-dotted border-stone-500/35 py-2 text-center text-xs font-bold uppercase leading-4 ${detailText && !hasValueOverride ? "" : "opacity-0"}`}>
        {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
      </span>
    </span>
  );
}

export function TvGuideRatingContent({
  channel,
  compact = false,
  detail,
  detailPrefix = "",
  label,
  score,
  value,
}: TvGuideRatingContentProps) {
  const hasValueOverride = value !== undefined;
  const detailText = detail ?? "";
  const ratingToneClassName = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)];
  const cardClassName = `media-carrier-font-tv-guide relative mx-auto block h-full w-full overflow-hidden bg-[#e3d2ad] text-black shadow-[0_8px_16px_rgba(28,25,23,0.12)] ${
    compact ? "min-h-[6.25rem] max-w-[14rem] p-2" : "min-h-[10.5rem] max-w-[18rem] p-3"
  }`;

  if (compact) {
    return (
      <span className={cardClassName}>
        <span className="relative z-10 flex h-full min-w-0 flex-col justify-between px-2 pb-2 pt-1.5">
          <span className="block border-b-2 border-black pb-1 text-center text-[10px] font-bold uppercase leading-none">
            {label}
          </span>
          <span className="mt-1 flex min-w-0 items-center justify-center gap-1 text-[9px] font-bold uppercase leading-3">
            <span>22:00</span>
            <span aria-hidden="true">·</span>
            <span>{channel} ТВ</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <span
              className={`block max-w-full font-bold italic leading-none tabular-nums ${ratingToneClassName} ${
                hasValueOverride ? "text-lg" : "text-5xl"
              }`}
            >
              {value ?? formatScore(score)}
            </span>
            {!hasValueOverride ? (
              null
            ) : (
              <span className="mt-2 block text-[8px] font-bold uppercase">чтобы поставить оценку</span>
            )}
          </span>
          <span
            className={`block min-h-4 text-center text-[9px] font-bold uppercase leading-4 ${
              detailText && !hasValueOverride ? "" : "opacity-0"
            }`}
          >
            {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={cardClassName}>
      <span className="relative z-10 flex h-full min-w-0 flex-col justify-between px-2 pb-2 pt-1.5">
        <span className="block border-b-2 border-black pb-1.5 text-center text-sm font-bold uppercase leading-none">
          {label}
        </span>
        <span className="grid min-h-0 flex-1 grid-cols-[2.2rem_minmax(0,1fr)_2.15rem]">
          <span className="border-r border-black pt-1 text-left text-xs font-bold">22:00</span>
          <span className="flex min-w-0 flex-col items-center justify-center px-2 text-center">
            <span
              className={`block max-w-full font-bold italic leading-none tabular-nums ${ratingToneClassName} ${
                hasValueOverride ? "text-2xl" : "text-7xl"
              }`}
            >
              {value ?? formatScore(score)}
            </span>
            {!hasValueOverride ? (
              null
            ) : (
              <span className="mt-2 block text-[10px] font-bold uppercase">чтобы поставить оценку</span>
            )}
          </span>
          <span className="flex justify-end border-l border-black pl-1 pt-1">
            <span className="grid h-11 w-9 place-items-center border-2 border-black bg-transparent text-2xl font-bold leading-none text-black">
              <span>{channel}</span>
              <span className="text-[8px] leading-none">ТВ</span>
            </span>
          </span>
        </span>
        <span
          className={`block min-h-4 text-center text-xs font-bold uppercase leading-4 ${
            detailText && !hasValueOverride ? "" : "opacity-0"
          }`}
        >
          {detailText && !hasValueOverride ? `${detailPrefix}${detailText}` : "—"}
        </span>
      </span>
    </span>
  );
}

export function RobloxRatingContent({
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
  const isAuthor = tone === "author";
  const hasValueOverride = value !== undefined;
  const toneClassName = RATING_TEXT_TONE_CLASS_NAMES[getRatingTone(score)];
  const valueToneClassName = isAuthor ? toneClassName : ARCHIVE_RATING_VALUE_CLASS_NAME;

  return (
    <span
      className={`${MEDIA_IDENTITY_FONT_CLASS_NAME} relative flex h-full min-w-0 flex-col items-center overflow-hidden border text-center ${
        compact ? "min-h-32 rounded-lg px-3 pb-3 pt-4" : "min-h-[11rem] rounded-xl px-5 pb-4 pt-5"
      } border-[color:var(--rating-author-border)] ${RATING_PANEL_TONE_CLASS_NAMES[getRatingTone(score)]}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(145deg,rgba(255,255,255,0.10),transparent_48%,rgba(0,0,0,0.18))] shadow-[inset_0_2px_0_rgba(255,255,255,0.26),inset_0_-5px_0_rgba(0,0,0,0.38)]"
      />
      {isAuthor ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 top-[-0.28rem] h-3 rounded-t-xl border border-[color:var(--rating-author-border)] bg-[var(--rating-background)] shadow-[inset_0_2px_0_rgba(255,255,255,0.20)]"
        />
      ) : null}
      {["left-3", "right-3"].map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={`absolute rounded-full border shadow-[inset_1px_1px_2px_rgba(255,255,255,0.55),inset_-1px_-1px_2px_rgba(15,23,42,0.2)] ${
            compact
              ? position === "left-3"
                ? "left-2 top-2 h-3 w-3"
                : "right-2 top-2 h-3 w-3"
              : `top-3 h-4 w-4 ${position}`
          } border-[color:var(--rating-author-border)] bg-[var(--rating-background)]`}
        />
      ))}
      <span
        className={`absolute inset-x-3 top-5 z-10 block font-semibold uppercase opacity-70 ${toneClassName} ${
          compact
            ? "text-[10px] leading-3"
            : "text-xs leading-4"
        }`}
      >
        {label}
      </span>
      <span
        className={`absolute left-1/2 top-1/2 z-10 block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none tabular-nums ${hasValueOverride ? "text-red-900" : valueToneClassName} ${
          hasValueOverride
            ? compact
              ? "text-xs"
              : "text-sm"
            : compact
              ? "text-3xl"
              : "text-4xl sm:text-5xl"
        }`}
      >
        {hasValueOverride ? value : (
          <span className="relative block leading-none">

            <span>{formatScore(score)}</span>
          </span>
        )}
      </span>
      <span
        className={`absolute inset-x-2 z-10 block font-semibold uppercase ${toneClassName} ${
          compact ? "bottom-3 text-[10px] leading-3" : "bottom-4 text-xs leading-4"
        } ${detail ? "opacity-70" : "opacity-0"}`}
      >
        {detail ? `${detailPrefix}${detail}` : "—"}
      </span>
    </span>
  );
}

export function ArchiveRatingPanel({
  compact = false,
  displayFontClassName,
  inverted = false,
  label,
  labelFontClassName,
  ratingPanelVariant,
  ratingsCount,
  score,
}: ArchiveRatingPanelProps) {
  if (ratingPanelVariant === "comic-card") {
    return (
      <ComicCardRatingContent
        compact={compact}
        detail={formatRatingsCount(ratingsCount)}
        label={label}
        score={score}
        tone="archive"
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
          compact ? "px-0.5 py-2" : "p-4"
        } border-[color:var(--rating-author-border)] ${RATING_PANEL_TONE_CLASS_NAMES[getRatingTone(score)]}`}
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
        compact ? ratingPanelVariant === "gamepad" ? "px-0.5 py-2" : "p-2" : "p-4"
      } border-[color:var(--rating-author-border)] ${RATING_PANEL_TONE_CLASS_NAMES[getRatingTone(score)]}`}
    >
      <div
        className={`${(ratingPanelVariant === "dvd-menu" || ratingPanelVariant === "roblox-plaque" || ratingPanelVariant === "tv-guide" || ratingPanelVariant === "modern-tv-guide" || ratingPanelVariant === "dos-terminal" || ratingPanelVariant === "standard") ? MEDIA_IDENTITY_FONT_CLASS_NAME : labelFontClassName} ${ratingPanelVariant === "gamepad" ? compact ? "text-[8px]" : "text-[10px]" : compact ? "text-[10px]" : "text-xs"} font-semibold uppercase leading-5 opacity-70`}
      >
        {label}
      </div>
      <div
        className={`${
          compact ? "mt-1 text-3xl" : "mt-2 text-4xl sm:text-5xl"
        } ${(ratingPanelVariant === "dvd-menu" || ratingPanelVariant === "roblox-plaque" || ratingPanelVariant === "tv-guide" || ratingPanelVariant === "modern-tv-guide" || ratingPanelVariant === "dos-terminal" || ratingPanelVariant === "standard") ? MEDIA_IDENTITY_FONT_CLASS_NAME : displayFontClassName} tabular-nums ${inverted ? "" : ARCHIVE_RATING_VALUE_CLASS_NAME}`}
      >
        {formatScore(score)}
      </div>

      <div
        className={`${
          compact ? "mt-1 leading-5" : "mt-2 leading-5"
        } ${(ratingPanelVariant === "dvd-menu" || ratingPanelVariant === "roblox-plaque" || ratingPanelVariant === "tv-guide" || ratingPanelVariant === "modern-tv-guide" || ratingPanelVariant === "dos-terminal" || ratingPanelVariant === "standard") ? MEDIA_IDENTITY_FONT_CLASS_NAME : labelFontClassName} ${ratingPanelVariant === "gamepad" ? compact ? "text-[8px]" : "text-[10px]" : compact ? "text-[10px]" : "text-xs"} font-semibold uppercase opacity-70`}
      >
        {formatRatingsCount(ratingsCount)}
      </div>
    </div>
  );
}
