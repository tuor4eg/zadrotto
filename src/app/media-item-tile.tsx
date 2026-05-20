import Link from "next/link";

import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/media-types";
import { formatRatingsCount, formatScore } from "@/lib/rating-score";
import {
  AVERAGE_RATING_TONE_CLASS_NAMES,
  AUTHOR_RATING_TONE_CLASS_NAMES,
  getRatingTone,
} from "@/lib/rating-tone";

type MediaItemTileItem = {
  averageScore: number | null;
  coverUrl: string | null;
  id: number;
  mediaType: MediaType;
  releaseYear: number | null;
  ratingsCount: number;
  title: string;
};

type ArchiveCoverProps = {
  className?: string;
  item: {
    coverUrl: string | null;
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

export function ArchiveCover({ className, item, mode = "cover" }: ArchiveCoverProps) {
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
      className={`grid place-items-center bg-[linear-gradient(135deg,#d8cbb4,#f7efdf_52%,#c8b58f)] text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 ${className ?? ""}`}
    >
      Без обложки
    </div>
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
  const className = `group relative block aspect-square overflow-hidden rounded-md border bg-stone-100 text-left shadow-[0_2px_0_rgba(68,64,60,0.10)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-red-900/60 hover:shadow-[0_8px_18px_rgba(68,64,60,0.20)] focus-visible:-translate-y-0.5 focus-visible:border-red-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900/35 ${
    selected ? "border-red-900/70" : "border-stone-300/80"
  }`;
  const content = (
    <>
      <ArchiveCover
        item={item}
        className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
      />
      <span aria-hidden="true" className="absolute inset-0 bg-stone-950/10" />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-stone-950/88 via-stone-950/44 to-transparent"
      />
      <span className="absolute bottom-3 left-2.5 right-[4.25rem] flex min-h-16 min-w-0 flex-col justify-end text-stone-50">
        <span className="block line-clamp-2 font-serif text-base leading-tight drop-shadow">
          {item.title}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.12em] text-stone-200">
          <span>{MEDIA_TYPE_LABELS[item.mediaType]}</span>
          {item.releaseYear ? <span>•</span> : null}
          {item.releaseYear ? <span>{item.releaseYear}</span> : null}
          <span>•</span>
          <span>{formatRatingsCount(item.ratingsCount)}</span>
        </span>
      </span>
      <span
        className={`absolute bottom-2 right-2 inline-flex h-8 items-center justify-center rounded-full border text-center shadow-sm ${averageRatingToneClassName} ${
          shouldShowAuthorScore ? "gap-1.5 pl-2.5 pr-1" : "w-8"
        }`}
      >
        <span className="min-w-4 text-center font-mono text-sm leading-none tabular-nums">
          {formatScore(item.averageScore)}
        </span>
        {shouldShowAuthorScore ? (
          <span
            className={`grid size-7 place-items-center rounded-full border text-center shadow-sm ${authorRatingToneClassName}`}
          >
            <span className="min-w-4 text-center font-mono text-base leading-none tabular-nums">
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
