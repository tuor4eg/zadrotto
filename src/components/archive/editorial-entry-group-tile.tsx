"use client";

import { MediaItemTile } from "@/app/media-item-tile";
import { MediaItemStatusTile } from "@/app/media-item-status-tile";
import { MediaItemRatingDialog } from "@/app/media-item-rating-dialog";
import { useState } from "react";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";
import { useDemoMediaOverlay } from "@/lib/user-state/use-demo-media-overlay";
import { useUserStateMode } from "@/lib/user-state/use-demo-profile";

export function EditorialEntryGroupTile({ item, currentAuthorStatus, currentAuthor, ratingAuthor, horizontalScroll = true }: Omit<EditorialCollectionGroupItem, "mediaItemId"> & {
  currentAuthor: boolean;
  ratingAuthor: { name: string; code: string } | null;
  horizontalScroll?: boolean;
}) {
  const [ratingRequest, setRatingRequest] = useState(0);
  const mode = useUserStateMode(currentAuthor);
  const demoOverlay = useDemoMediaOverlay(item.code, item.currentAuthorScore, currentAuthorStatus);
  const score = mode === "demo" ? demoOverlay.score : item.currentAuthorScore;
  const status = mode === "demo" ? demoOverlay.status : currentAuthorStatus;
  const tileProps = { item, href: `/media/${item.code}`, currentAuthorScore: score, onRatingClick: () => setRatingRequest((request) => request + 1) };

  return <div className="grid gap-2">
    {mode === "plain"
      ? <MediaItemTile {...tileProps} />
      : <MediaItemStatusTile {...tileProps} currentAuthorStatus={status} horizontalScroll={horizontalScroll} />}
    <p className="text-sm leading-5 text-stone-500">{[item.releaseYear, item.mediaTypeName].filter(Boolean).join(" · ")}</p>
    {ratingRequest > 0 ? <div hidden>
      <MediaItemRatingDialog
        key={ratingRequest}
        openRequestKey={ratingRequest}
        mediaItemCode={item.code}
        title={item.title}
        currentAuthor={ratingAuthor}
        currentAuthorScore={item.currentAuthorScore}
        currentAuthorFirstExperiencedAt={item.currentAuthorFirstExperiencedAt}
        currentAuthorFirstExperiencedPrecision={item.currentAuthorFirstExperiencedPrecision}
        releaseYear={item.releaseYear}
      />
    </div> : null}
  </div>;
}
