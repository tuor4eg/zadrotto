import Link from "next/link";

import { getMediaCarrierFrame, type MediaCarrierFrame } from "@/lib/media/carrier-frame";
import { type MediaType } from "@/lib/media/types";
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
    title: string;
  };
  mode?: "cover" | "contain";
};

type MediaItemTileProps = {
  currentAuthorScore?: number | null;
  href?: string;
  item: MediaItemTileItem;
  onSelect?: () => void;
  selected?: boolean;
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

export function ArchiveCover({
  carrierFrameSize = "default",
  carrierFrame = true,
  className,
  item,
  mode = "cover",
}: ArchiveCoverProps) {
  const mediaCarrierFrame = carrierFrame ? getMediaCarrierFrame(item) : null;

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
  onSelect,
  selected = false,
}: MediaItemTileProps) {
  const shouldShowAuthorScore = currentAuthorScore !== undefined && currentAuthorScore !== null;
  const averageRatingToneClassName =
    AVERAGE_RATING_TONE_CLASS_NAMES[getRatingTone(item.averageScore)];
  const authorRatingToneClassName =
    AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(currentAuthorScore ?? null)];
  const className = `group relative block aspect-[2/3] overflow-hidden rounded-md border bg-stone-100 text-left shadow-[0_2px_0_rgba(68,64,60,0.10)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-red-900/60 hover:shadow-[0_8px_18px_rgba(68,64,60,0.20)] focus-visible:-translate-y-0.5 focus-visible:border-red-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900/35 ${
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

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={className}
      aria-pressed={selected}
    >
      {content}
    </button>
  );
}
