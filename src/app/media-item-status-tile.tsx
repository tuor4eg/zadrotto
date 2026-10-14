"use client";

import { useRef, useState, type ComponentProps } from "react";

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
  const [statusActionsRevealed, setStatusActionsRevealed] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const didSwipeToReveal = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const showStatusActions = !currentAuthorHasRating;

  return (
    <div
      className={`group relative aspect-[2/3] min-w-0 ${horizontalScroll ? "touch-auto" : "touch-pan-y"} [&>a]:h-full [&>a]:w-full [&>button]:h-full [&>button]:w-full`}
      onTouchStart={horizontalScroll ? (event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      } : undefined}
      onTouchMove={horizontalScroll ? (event) => {
        const x = event.touches[0]?.clientX;
        if (showStatusActions && touchStartX.current !== null && x !== undefined && x - touchStartX.current < -40) {
          setStatusActionsRevealed(true);
        }
      } : undefined}
      onTouchEnd={horizontalScroll ? () => { touchStartX.current = null; } : undefined}
      onTouchCancel={horizontalScroll ? () => { touchStartX.current = null; } : undefined}
      onPointerDown={(event) => {
        const isDesktopMouse =
          event.pointerType === "mouse" && window.matchMedia("(min-width: 1280px)").matches;
        if (!showStatusActions || isDesktopMouse || horizontalScroll) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerStartX.current = event.clientX;
        didSwipeToReveal.current = false;
      }}
      onPointerUp={(event) => {
        if (
          showStatusActions &&
          pointerStartX.current !== null &&
          event.clientX - pointerStartX.current < -40
        ) {
          didSwipeToReveal.current = true;
          setStatusActionsRevealed(true);
        }
        pointerStartX.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        pointerStartX.current = null;
        didSwipeToReveal.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onClickCapture={(event) => {
        if (!didSwipeToReveal.current) return;
        event.preventDefault();
        event.stopPropagation();
        didSwipeToReveal.current = false;
      }}
    >
      <MediaItemTile currentAuthorScore={currentAuthorScore} item={item} {...tileProps} />
      {showStatusActions ? (
        <div
          className={`absolute left-2 top-2 z-30 transition-opacity xl:pointer-events-none xl:opacity-0 xl:group-hover:pointer-events-auto xl:group-hover:opacity-100 xl:focus-within:pointer-events-auto xl:focus-within:opacity-100 ${
            statusActionsRevealed
              ? "max-xl:pointer-events-auto max-xl:opacity-100"
              : "max-xl:pointer-events-none max-xl:opacity-0 max-xl:focus-within:pointer-events-auto max-xl:focus-within:opacity-100"
          }`}
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
