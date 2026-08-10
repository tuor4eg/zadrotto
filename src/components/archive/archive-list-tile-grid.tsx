"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MediaItemTile } from "@/app/media-item-tile";
import {
  ARCHIVE_CATALOG_GRID_ROW_COUNT,
  ARCHIVE_LIST_TILE_GAP,
  getArchiveListColumnCount,
  getArchiveListPageSize,
} from "@/lib/archive/tile-grid-capacity";

import type { ResponsiveTileDescriptor } from "./responsive-tile-grid";

type ArchiveListTileGridProps = {
  items: ResponsiveTileDescriptor[];
  pageSize: number;
};

export function ArchiveListTileGrid({ items, pageSize }: ArchiveListTileGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [columnCount, setColumnCount] = useState(() =>
    Math.max(3, Math.floor(items.length / ARCHIVE_CATALOG_GRID_ROW_COUNT) || 3),
  );

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return;
    }

    const syncLayout = (width: number) => {
      const nextColumnCount = getArchiveListColumnCount(width);
      setColumnCount(nextColumnCount);

      const nextPageSize = getArchiveListPageSize(width);

      if (nextPageSize === pageSize) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("pageSize", String(nextPageSize));
      params.delete("page");

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const observer = new ResizeObserver(([entry]) => {
      syncLayout(entry.contentRect.width);
    });

    syncLayout(grid.getBoundingClientRect().width);
    observer.observe(grid);

    return () => observer.disconnect();
  }, [pageSize, pathname, router, searchParams]);

  return (
    <div
      ref={gridRef}
      className="grid content-start"
      style={{
        gap: `${ARCHIVE_LIST_TILE_GAP}px`,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
    >
      {items.map((descriptor) => (
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
