"use client";

import Link from "next/link";
import { MediaItemTile } from "@/app/media-item-tile";
import { ImageViewer } from "@/components/ui/image-viewer";
import type { TitlePartView } from "@/db/queries/title-parts";
import { formatPluralCount } from "@/lib/media/media-item-summary";
import { getTitlePartLabel, isTitlePartRateable, isTitlePartReviewable } from "@/lib/media/title-parts";
import type { MediaType } from "@/lib/media/types";

export function TitlePartCard({ part, mediaType, myRating, onRate, onDescribe }: {
  part: TitlePartView;
  mediaType: MediaType;
  myRating: number | null;
  onRate: () => void;
  onDescribe: () => void;
}) {
  const rateable = isTitlePartRateable(part);
  const label = getTitlePartLabel(part);
  const numberedLabel = getTitlePartLabel({ ...part, name: null });
  const posterUrl = part.coverUrl ?? part.coverThumbUrl;
  const renderTile = (openPoster?: () => void) => (
    <MediaItemTile
      item={{
        id: part.id,
        code: `part-${part.id}`,
        title: label,
        mediaType,
        releaseYear: part.year,
        coverUrl: part.coverUrl,
        coverThumbUrl: part.coverThumbUrl,
        averageScore: part.archiveRating,
        ratingsCount: part.ratingsCount,
      }}
      subtitle={label !== numberedLabel ? numberedLabel : undefined}
      currentAuthorScore={myRating}
      ratingDisplay={rateable ? "default" : "none"}
      onRatingClick={rateable ? onRate : undefined}
      onSelect={openPoster ?? (part.description?.trim() ? onDescribe : undefined)}
    />
  );
  return <article className="min-w-0 [&>button]:w-full">
    {posterUrl ? (
      <ImageViewer src={posterUrl} alt={`Обложка: ${label}`} title={label}>
        {renderTile}
      </ImageViewer>
    ) : renderTile()}
    <p className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-xs text-stone-600">
      <span>{part.year ?? "—"}</span>
      {part.type === "season" && rateable && part.episodeCount !== null ? (
        <span>{formatPluralCount(part.episodeCount, { one: "серия", few: "серии", many: "серий" })}</span>
      ) : null}
    </p>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {part.description?.trim() ? (
        <button type="button" onClick={onDescribe} aria-haspopup="dialog"
          aria-label={`Описание: ${label}`} className="underline decoration-stone-400 underline-offset-4">Описание</button>
      ) : null}
      {isTitlePartReviewable(part) ? <Link className="underline decoration-stone-400 underline-offset-4"
        href={part.myReviewId ? `/reviews/${part.myReviewId}` : `/reviews/new?mediaItemId=${part.mediaItemId}&partId=${part.id}`}>
        {part.myReviewId ? "Моя рецензия" : "Написать рецензию"}
      </Link> : null}
    </div>
  </article>;
}
