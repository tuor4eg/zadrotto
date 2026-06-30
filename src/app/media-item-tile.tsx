import Link from "next/link";
import { Play, Plus } from "lucide-react";

import { getMediaCarrierFrame, type MediaCarrierFrame } from "@/lib/media/carrier-frame";
import {
  getMediaTypeLabel,
  type MediaType,
  type MediaTypeOption,
} from "@/lib/media/types";
import { formatScore } from "@/lib/ratings/score";
import {
  AVERAGE_RATING_TONE_CLASS_NAMES,
  AUTHOR_RATING_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/ratings/tone";

type MediaItemTileItem = {
  averageScore: number | null;
  coverThumbUrl?: string | null;
  coverUrl: string | null;
  id: number;
  mediaCarrierCode?: string | null;
  mediaType: MediaType;
  releaseYear: number | null;
  ratingsCount: number;
  title: string;
};

type ArchiveCoverProps = {
  carrierFrameSize?: "default" | "compact";
  className?: string;
  carrierFrame?: boolean;
  item: {
    coverUrl: string | null;
    mediaCarrierCode?: string | null;
    mediaType?: MediaType;
    releaseYear?: number | null;
    title: string;
  };
  mode?: "cover" | "contain";
};

type MediaItemTileProps = {
  currentAuthorScore?: number | null;
  href?: string;
  item: MediaItemTileItem;
  mediaTypes?: readonly MediaTypeOption[];
  onSelect?: () => void;
  selected?: boolean;
  showMediaTypeLabel?: boolean;
};

function MediaCarrierCoverPlaceholder({ frame }: { frame: MediaCarrierFrame }) {
  const labelClassName = `relative z-10 inline-block rounded-sm px-2 py-1 text-center font-semibold uppercase shadow-[0_1px_0_rgba(255,255,255,0.45)] ${
    frame.fontClassName ?? "font-mono tracking-[0.12em]"
  }`;
  const layerClassName = frame.coverLayer === "above-frame" ? "z-20" : "z-0";

  if (frame.placeholderVariant === "dos-disk-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[2%] border border-stone-300/55 bg-[linear-gradient(180deg,#fffdf5_0%,#f2ecd8_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[31%] h-px bg-blue-900/13 shadow-[0_1.05rem_0_rgba(30,58,138,0.13),0_2.1rem_0_rgba(30,58,138,0.13)]"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-2 h-3 w-9 border-b border-r border-red-900/20"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-stone-50/80 text-[9px] leading-4 text-stone-950/72`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "dvd-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[1%] border border-stone-950/16 bg-[linear-gradient(180deg,#f9fafb_0%,#f4f4f1_58%,#dfdbd2_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-4 top-4 h-px bg-stone-950/12 shadow-[0_0.72rem_0_rgba(28,25,23,0.1),0_1.44rem_0_rgba(28,25,23,0.08)]"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-stone-50/82 text-[9px] leading-4 text-stone-950/72`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "eight-bit-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[1%] border border-stone-950/30 bg-[linear-gradient(180deg,#f8f4df_0%,#e2d8bf_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-2 h-px bg-stone-950/18 shadow-[0_0.55rem_0_rgba(28,25,23,0.14),0_1.1rem_0_rgba(28,25,23,0.1)]"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-2 right-2 h-2.5 w-8 border-b border-r border-stone-950/18"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-stone-50/76 text-[8px] leading-4 text-stone-950/78`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "vhs-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[4%] border border-stone-950/14 bg-[linear-gradient(180deg,#f7f3ea_0%,#e3ded3_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-4 h-px bg-stone-950/12 shadow-[0_0.72rem_0_rgba(28,25,23,0.1),0_1.44rem_0_rgba(28,25,23,0.08)]"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-3 left-3 right-3 h-px bg-stone-950/12"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-stone-50/78 text-[9px] leading-4 text-stone-950/72`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "tv-screen-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[8%] bg-stone-950 px-3 py-2 shadow-[inset_0_0_22px_rgba(255,255,255,0.08)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(68,64,60,0.35)_0%,rgba(12,10,9,0.94)_68%)]"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span className={`${labelClassName} bg-stone-50/80 text-[9px] leading-4 text-stone-950/72`}>
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "reel-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[7%] border border-stone-950/18 bg-[linear-gradient(180deg,#efe4ca_0%,#d9c6a2_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-55 [background-image:radial-gradient(circle_at_22%_16%,rgba(68,64,60,0.18)_0_1px,transparent_1px),radial-gradient(circle_at_68%_54%,rgba(68,64,60,0.12)_0_1px,transparent_1px)] [background-size:9px_9px,13px_13px]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-5 top-5 h-px bg-stone-950/22 shadow-[0_1.05rem_0_rgba(28,25,23,0.14),0_2.1rem_0_rgba(28,25,23,0.1)]"
        />
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-[#efe4ca]/80 text-[12px] leading-4 text-stone-950/72`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  if (frame.placeholderVariant === "win9x-jewel-label") {
    return (
      <span
        className={`absolute overflow-hidden rounded-[1%] border border-stone-950/35 bg-[#c0c0c0] p-1.5 shadow-[inset_1px_1px_0_rgba(255,255,255,0.9),inset_-1px_-1px_0_rgba(0,0,0,0.32)] ${layerClassName} ${frame.coverAreaClassName}`}
      >
        <span className="relative z-10 grid h-full place-items-center">
          <span
            className={`${labelClassName} bg-stone-100/90 text-[9px] leading-4 text-stone-950/78 shadow-[inset_1px_1px_0_rgba(255,255,255,0.85),inset_-1px_-1px_0_rgba(0,0,0,0.22)]`}
          >
            Нет изображения
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      className={`absolute overflow-hidden rounded-[1%] border border-stone-950/28 bg-[linear-gradient(180deg,#f7f7f5_0%,#d7d3ca_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${layerClassName} ${frame.coverAreaClassName}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-2 bg-stone-950/14"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-3 bottom-2 h-px bg-stone-950/16 shadow-[0_-0.55rem_0_rgba(28,25,23,0.1)]"
      />
      <span className="relative z-10 grid h-full place-items-center">
        <span
          className={`${labelClassName} bg-stone-50/76 text-[9px] leading-4 text-stone-950/78`}
        >
          Нет изображения
        </span>
      </span>
    </span>
  );
}

function CartridgeCover({
  carrierFrameSize = "default",
  className,
  frame,
  item,
}: Omit<ArchiveCoverProps, "mode"> & { frame: MediaCarrierFrame }) {
  const coverLayerClassName =
    frame.coverLayer === "above-frame" ? "z-20" : "z-0";
  const sizeClassName =
    carrierFrameSize === "compact"
      ? frame.compactSizeClassName ?? frame.sizeClassName
      : frame.sizeClassName;

  return (
    <div
      role="img"
      aria-label={
        item.coverUrl
          ? `Обложка на носителе: ${item.title}`
          : `Обложка не добавлена: ${item.title}`
      }
      className={`media-carrier-lift-trigger grid place-items-center ${className ?? ""}`}
    >
      <span
        className={`relative block ${frame.aspectRatioClassName} ${
          sizeClassName ?? "w-[96%] max-w-full"
        }`}
      >
        {item.coverUrl ? (
          <span
            className={`absolute overflow-hidden rounded-[2%] ${coverLayerClassName} ${frame.coverAreaClassName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.coverUrl}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <MediaCarrierCoverPlaceholder frame={frame} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.assetPath}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-10 h-full w-full object-contain"
        />
      </span>
    </div>
  );
}

function CoverOverlayCover({
  carrierFrameSize = "default",
  className,
  frame,
  item,
}: Omit<ArchiveCoverProps, "mode"> & { frame: MediaCarrierFrame }) {
  const sizeClassName =
    carrierFrameSize === "compact"
      ? frame.compactSizeClassName ?? frame.sizeClassName
      : frame.sizeClassName;

  return (
    <div
      role="img"
      aria-label={
        item.coverUrl
          ? `Обложка: ${item.title}`
          : `Обложка не добавлена: ${item.title}`
      }
      className={`media-carrier-lift-trigger grid place-items-center ${className ?? ""}`}
    >
      <span
        className={`relative block overflow-hidden rounded-[2%] bg-stone-900 shadow-[0_10px_24px_rgba(15,23,42,0.24)] ${frame.aspectRatioClassName} ${
          sizeClassName ?? "w-[96%] max-w-full"
        }`}
      >
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <MediaCarrierCoverPlaceholder frame={frame} />
        )}
        {frame.topGradientClassName ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 z-20 ${frame.topGradientClassName}`}
          />
        ) : null}
        {frame.topLogoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame.topLogoPath}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute z-30 h-auto ${frame.topLogoClassName ?? ""}`}
          />
        ) : null}
        {frame.bottomOverlayPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame.bottomOverlayPath}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 w-full ${frame.bottomOverlayClassName ?? ""}`}
          />
        ) : null}
      </span>
    </div>
  );
}

function StreamingCover({
  carrierFrameSize = "default",
  className,
  frame,
  item,
}: Omit<ArchiveCoverProps, "mode"> & { frame: MediaCarrierFrame }) {
  const sizeClassName =
    carrierFrameSize === "compact"
      ? frame.compactSizeClassName ?? frame.sizeClassName
      : frame.sizeClassName;
  const progressLabel = frame.streamingProgressLabel ?? "Продолжить просмотр";

  return (
    <div
      role="img"
      aria-label={
        item.coverUrl
          ? `Стриминговая обложка: ${item.title}`
          : `Обложка не добавлена: ${item.title}`
      }
      className={`media-carrier-lift-trigger grid place-items-center ${className ?? ""}`}
    >
      <span
        className={`relative block overflow-hidden rounded-[3%] border border-white/12 bg-stone-950 shadow-[0_14px_30px_rgba(15,23,42,0.28),0_0_0_1px_rgba(255,255,255,0.08)] ${frame.fontClassName ?? ""} ${frame.aspectRatioClassName} ${
          sizeClassName ?? "w-[96%] max-w-full"
        }`}
      >
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <MediaCarrierCoverPlaceholder frame={frame} />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.54)_0%,rgba(0,0,0,0.08)_24%,rgba(0,0,0,0.06)_56%,rgba(0,0,0,0.74)_100%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[3%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15),inset_0_0_24px_rgba(255,255,255,0.08)]"
        />
        <span className="absolute left-[7%] right-[7%] top-[5.5%] z-30 flex items-start justify-between gap-3">
          {frame.streamingTopBadgeLabel ? (
            <span className="rounded-[0.32rem] bg-indigo-500/78 px-2 py-1 text-[clamp(0.44rem,2.2vw,0.68rem)] font-semibold uppercase leading-none tracking-[0.08em] text-indigo-50 shadow-[0_1px_5px_rgba(0,0,0,0.24)]">
              {frame.streamingTopBadgeLabel}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="flex items-center gap-2 text-[clamp(0.44rem,2.1vw,0.66rem)] font-semibold uppercase leading-none tracking-[0.08em] text-white/88">
            <span>4K</span>
            <span>HDR</span>
          </span>
        </span>
        <span className="absolute bottom-[5.5%] left-[7%] right-[7%] z-30">
          <span className="mb-[5%] flex items-center gap-[5%]">
            <span className="grid aspect-square w-[15%] shrink-0 place-items-center rounded-full bg-white text-stone-950 shadow-[0_4px_12px_rgba(0,0,0,0.28)]">
              <Play className="ml-[7%] h-[45%] w-[45%] fill-current" strokeWidth={2.8} />
            </span>
            <span className="min-w-0 flex-1 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              <span className="block truncate text-[clamp(0.5rem,2.4vw,0.78rem)] font-semibold leading-tight">
                Продолжить просмотр
              </span>
              <span className="mt-0.5 block truncate text-[clamp(0.42rem,2vw,0.64rem)] leading-tight text-white/78">
                {progressLabel}
              </span>
            </span>
            <span className="grid aspect-square w-[11.5%] shrink-0 place-items-center rounded-full border border-white/72 bg-black/16 text-white shadow-[0_2px_8px_rgba(0,0,0,0.24)]">
              <Plus className="h-[58%] w-[58%]" strokeWidth={2.2} />
            </span>
          </span>
          <span className="block h-[0.2rem] overflow-hidden rounded-full bg-white/25 shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <span className="block h-full w-[49%] rounded-full bg-white" />
          </span>
        </span>
      </span>
    </div>
  );
}

function PackagedArchiveCover({
  className,
  frame,
  item,
  mode = "cover",
}: Pick<ArchiveCoverProps, "className" | "item" | "mode"> & { frame: MediaCarrierFrame }) {
  const position = className?.includes("absolute") ? "absolute" : "relative";
  const label = item.coverUrl
    ? `Обложка в пленке: ${item.title}`
    : `Обложка не добавлена: ${item.title}`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`media-carrier-lift-trigger grid place-items-center overflow-visible ${className ?? ""}`}
      style={{ position }}
    >
      <span className="relative block h-full w-full">
        <span
          className={`absolute overflow-hidden bg-[radial-gradient(circle_at_50%_28%,#fff8e8_0,#ead8b7_42%,#bfa277_100%)] ${frame.coverAreaClassName}`}
        >
          {item.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: mode }}
            />
          ) : null}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.assetPath}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill drop-shadow-[0_2px_3px_rgba(28,25,23,0.22)]"
        />
      </span>
    </div>
  );
}

export function ArchiveCover({
  carrierFrameSize = "default",
  carrierFrame = true,
  className,
  item,
  mode = "cover",
}: ArchiveCoverProps) {
  const mediaCarrierFrame = carrierFrame ? getMediaCarrierFrame(item) : null;

  if (mediaCarrierFrame?.renderKind === "packaged-cover") {
    return (
      <PackagedArchiveCover
        className={className}
        frame={mediaCarrierFrame}
        item={item}
        mode={mode}
      />
    );
  }

  if (mediaCarrierFrame?.renderKind === "cover-overlay") {
    return (
      <CoverOverlayCover
        carrierFrameSize={carrierFrameSize}
        className={className}
        frame={mediaCarrierFrame}
        item={item}
      />
    );
  }

  if (mediaCarrierFrame?.renderKind === "streaming-cover") {
    return (
      <StreamingCover
        carrierFrameSize={carrierFrameSize}
        className={className}
        frame={mediaCarrierFrame}
        item={item}
      />
    );
  }

  if (mediaCarrierFrame?.renderKind === "cartridge") {
    return (
      <CartridgeCover
        carrierFrameSize={carrierFrameSize}
        className={className}
        frame={mediaCarrierFrame}
        item={item}
      />
    );
  }

  if (item.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.coverUrl}
        alt={`Обложка: ${item.title}`}
        className={className}
        style={{ objectFit: mode }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`Обложка не добавлена: ${item.title}`}
      className={`grid place-items-center bg-[radial-gradient(circle_at_50%_28%,#fff8e8_0,#ead8b7_42%,#bfa277_100%)] text-stone-700 ${className ?? ""}`}
    />
  );
}

export function MediaItemTile({
  currentAuthorScore,
  href,
  item,
  mediaTypes = [],
  onSelect,
  selected = false,
  showMediaTypeLabel = false,
}: MediaItemTileProps) {
  const shouldShowAuthorScore = currentAuthorScore !== undefined && currentAuthorScore !== null;
  const mediaTypeLabel =
    showMediaTypeLabel && mediaTypes.length > 0
      ? getMediaTypeLabel(item.mediaType, mediaTypes)
      : null;
  const averageRatingToneClassName =
    AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(item.averageScore)];
  const authorRatingToneClassName =
    AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(currentAuthorScore ?? null)];
  const className = `group relative aspect-[2/3] overflow-hidden rounded-md border bg-stone-100 text-left shadow-[0_2px_0_rgba(68,64,60,0.10)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-red-900/60 hover:shadow-[0_8px_18px_rgba(68,64,60,0.20)] focus-visible:-translate-y-0.5 focus-visible:border-red-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900/35 ${
    selected ? "border-red-900/70" : "border-stone-300/80"
  }`;
  const tileCoverItem = {
    ...item,
    coverUrl: item.coverThumbUrl ?? item.coverUrl,
  };
  const content = (
    <>
      <ArchiveCover
        carrierFrame={false}
        item={tileCoverItem}
        className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
      />
      <span aria-hidden="true" className="absolute inset-0 bg-stone-950/10" />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-stone-950/88 via-stone-950/44 to-transparent"
      />
      {mediaTypeLabel ? (
        <span
          className="absolute left-2 top-2 max-w-[calc(100%-3.5rem)] truncate rounded-sm border border-stone-50/30 bg-stone-950/62 px-1.5 py-1 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-stone-50 shadow-sm backdrop-blur-[1px]"
          title={mediaTypeLabel}
        >
          {mediaTypeLabel}
        </span>
      ) : null}
      <span className="absolute bottom-3 left-2.5 right-2.5 flex min-h-16 min-w-0 flex-col justify-end text-stone-50">
        <span className="block line-clamp-2 font-serif text-base leading-tight drop-shadow">
          {item.title}
        </span>
      </span>
      <span
        className={`absolute right-2 top-2 inline-flex h-7 items-center justify-center rounded-full border text-center shadow-sm ${averageRatingToneClassName} ${
          shouldShowAuthorScore ? "gap-1 pl-2 pr-1" : "w-7"
        }`}
      >
        <span className="min-w-3.5 text-center font-mono text-xs leading-none tabular-nums">
          {formatScore(item.averageScore)}
        </span>
        {shouldShowAuthorScore ? (
          <span
            className={`grid size-6 place-items-center rounded-full border text-center shadow-sm ${authorRatingToneClassName}`}
          >
            <span className="min-w-3.5 text-center font-mono text-xs leading-none tabular-nums">
              {formatScore(currentAuthorScore)}
            </span>
          </span>
        ) : null}
      </span>
    </>
  );

  if (href && onSelect) {
    return (
      <>
        <Link href={href} className={`block xl:hidden ${className}`}>
          {content}
        </Link>
        <button
          type="button"
          onClick={onSelect}
          className={`hidden xl:block ${className}`}
          aria-pressed={selected}
        >
          {content}
        </button>
      </>
    );
  }

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block ${className}`}
      aria-pressed={selected}
    >
      {content}
    </button>
  );
}
