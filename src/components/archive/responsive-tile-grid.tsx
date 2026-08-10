"use client";

import { useEffect, useRef, useState } from "react";

import { MediaItemTile, type MediaItemTileItem } from "@/app/media-item-tile";

const GRID_GAP = 12;
const TARGET_CARD_WIDTH = {
  compact: 72,
  top: 140,
} as const;

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
  variant?: keyof typeof TARGET_CARD_WIDTH;
};

export function getTileGridColumnCount(
  width: number,
  variant: keyof typeof TARGET_CARD_WIDTH,
) {
  return Math.max(
    3,
    Math.floor((width + GRID_GAP) / (TARGET_CARD_WIDTH[variant] + GRID_GAP)),
  );
}

export function getInitialTileGridColumnCount(
  initialColumnCount: number | undefined,
  variant: keyof typeof TARGET_CARD_WIDTH,
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
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
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
