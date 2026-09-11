"use client";

import { useEffect, useRef, useState } from "react";

import { MediaItemTile, type MediaItemTileItem } from "@/app/media-item-tile";
import {
  ARCHIVE_LIST_TARGET_TILE_WIDTH,
  ARCHIVE_LIST_TILE_GAP,
} from "@/lib/archive/tile-grid-capacity";

const TILE_GRID = {
  archive: { gap: ARCHIVE_LIST_TILE_GAP, width: ARCHIVE_LIST_TARGET_TILE_WIDTH },
  compact: { gap: 12, width: 72 },
  top: { gap: 12, width: 140 },
  topCompact: { gap: 12, width: 112 },
} as const;

export type ResponsiveTileGridVariant = keyof typeof TILE_GRID;

export type ResponsiveTileDescriptor = {
  currentAuthorScore?: number | null;
  href: string;
  item: MediaItemTileItem;
  key: number | string;
  ratingDisplay?: "default" | "author-only";
};

type ResponsiveTileGridProps = {
  initialColumnCount?: number;
  items: ResponsiveTileDescriptor[];
  variant?: ResponsiveTileGridVariant;
};

export function getTileGridColumnCount(
  width: number,
  variant: ResponsiveTileGridVariant,
) {
  const { gap, width: cardWidth } = TILE_GRID[variant];

  return Math.max(3, Math.floor((width + gap) / (cardWidth + gap)));
}

export function getInitialTileGridColumnCount(
  initialColumnCount: number | undefined,
  variant: ResponsiveTileGridVariant,
) {
  const defaultColumnCount = variant === "top" ? 7 : 6;

  return initialColumnCount === undefined || !Number.isFinite(initialColumnCount)
    ? defaultColumnCount
    : Math.max(1, Math.floor(initialColumnCount));
}

export function ResponsiveTileGrid({
  initialColumnCount,
  items,
  variant = "compact",
}: ResponsiveTileGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(() =>
    getInitialTileGridColumnCount(initialColumnCount, variant),
  );

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return;
    }

    const updateColumnCount = (width: number) => {
      setColumnCount(getTileGridColumnCount(width, variant));
    };
    const observer = new ResizeObserver(([entry]) => {
      updateColumnCount(entry.contentRect.width);
    });

    updateColumnCount(grid.getBoundingClientRect().width);
    observer.observe(grid);

    return () => observer.disconnect();
  }, [variant]);

  if (items.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-sm text-stone-500">
        Здесь пока пусто
      </p>
    );
  }

  const visibleItems = items.slice(0, columnCount);

  return (
    <div
      ref={gridRef}
      className="grid"
      style={{
        gap: `${TILE_GRID[variant].gap}px`,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
    >
      {visibleItems.map((descriptor) => (
        <MediaItemTile
          key={descriptor.key}
          currentAuthorScore={descriptor.currentAuthorScore}
          href={descriptor.href}
          item={descriptor.item}
          ratingDisplay={descriptor.ratingDisplay}
        />
      ))}
    </div>
  );
}
