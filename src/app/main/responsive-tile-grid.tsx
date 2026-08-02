"use client";

import { useEffect, useRef, useState } from "react";

import { MediaItemTile } from "@/app/media-item-tile";
import type { MainPageMediaItem } from "@/db/queries/main-page";

const GRID_GAP = 12;
const TARGET_CARD_WIDTH = {
  compact: 72,
  top: 140,
} as const;

type ResponsiveTileGridProps = {
  items: MainPageMediaItem[];
  variant?: keyof typeof TARGET_CARD_WIDTH;
};

export function ResponsiveTileGrid({
  items,
  variant = "compact",
}: ResponsiveTileGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(variant === "top" ? 7 : 6);

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return;
    }

    const updateVisibleCount = (width: number) => {
      const count = Math.max(
        1,
        Math.floor((width + GRID_GAP) / (TARGET_CARD_WIDTH[variant] + GRID_GAP)),
      );

      setVisibleCount(count);
    };
    const observer = new ResizeObserver(([entry]) => {
      updateVisibleCount(entry.contentRect.width);
    });

    updateVisibleCount(grid.getBoundingClientRect().width);
    observer.observe(grid);

    return () => observer.disconnect();
  }, [items.length, variant]);

  if (items.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-sm text-stone-500">
        В истории пока нет доступных записей.
      </p>
    );
  }

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div
      ref={gridRef}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))` }}
    >
      {visibleItems.map((item) => (
        <MediaItemTile
          key={item.id}
          currentAuthorScore={item.currentAuthorScore}
          href={`/media/${item.code}`}
          item={item}
        />
      ))}
    </div>
  );
}
