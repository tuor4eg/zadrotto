"use client";

import type { ComponentProps } from "react";

import { AuthorMediaStatusControls } from "@/app/author-media-status-controls";
import { MediaItemTile } from "@/app/media-item-tile";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";

type MediaItemStatusTileProps = Omit<ComponentProps<typeof MediaItemTile>, "currentAuthorScore"> & {
  currentAuthorScore: number | null;
  currentAuthorStatus: AuthorMediaStatus | null;
  horizontalScroll?: boolean;
  currentAuthorHasRating?: boolean;
  isAuthorized?: boolean;
};

export function MediaItemStatusTile({
  currentAuthorScore,
  currentAuthorHasRating = currentAuthorScore !== null,
  isAuthorized = false,
  currentAuthorStatus,
  item,
  horizontalScroll = false,
  ...tileProps
}: MediaItemStatusTileProps) {
  const showStatusActions = !currentAuthorHasRating;

  return (
    <div
      className={`group group/media-status relative aspect-[2/3] min-w-0 ${horizontalScroll ? "touch-auto" : "touch-pan-y"} [&>a]:h-full [&>a]:w-full [&>button]:h-full [&>button]:w-full`}
    >
      <MediaItemTile currentAuthorScore={currentAuthorScore} item={item} {...tileProps} />
      {showStatusActions ? (
        <div
          className="absolute left-2 top-2 z-30 transition-opacity has-[[aria-pressed=true]]:pointer-events-auto has-[[aria-pressed=true]]:opacity-100 xl:pointer-events-none xl:opacity-0 xl:group-hover:pointer-events-auto xl:group-hover:opacity-100 xl:focus-within:pointer-events-auto xl:focus-within:opacity-100"
        >
          <AuthorMediaStatusControls
            currentAuthorScore={currentAuthorScore}
            currentAuthorHasRating={currentAuthorHasRating}
            isAuthorized={isAuthorized}
            currentAuthorStatus={currentAuthorStatus}
            mediaItemCode={item.code}
            variant="tile"
          />
        </div>
      ) : null}
    </div>
  );
}
