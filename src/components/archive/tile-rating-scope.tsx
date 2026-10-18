"use client";

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { MediaItemTile } from "@/app/media-item-tile";

const LazyTileRatingDialog = dynamic(() => import("./tile-rating-dialog"), {
  ssr: false,
  loading: () => <p role="status" className="text-sm text-stone-600">Загрузка оценки…</p>,
});
const TileRatingContext = createContext<((code: string, partId?: number | null) => void) | null>(null);

export function TileRatingScope({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ code: string; partId?: number | null; key: number } | null>(null);
  return (
    <TileRatingContext.Provider value={(code, partId) => setRequest((previous) => ({ code, partId, key: (previous?.key ?? 0) + 1 }))}>
      {children}
      {request ? <LazyTileRatingDialog key={request.key} code={request.code} partId={request.partId} /> : null}
    </TileRatingContext.Provider>
  );
}

export function RateableMediaItemTile({ partId, ...props }: ComponentProps<typeof MediaItemTile> & { partId?: number | null }) {
  const openRating = useContext(TileRatingContext);
  return <MediaItemTile {...props} onRatingClick={openRating ? () => openRating(props.item.code, partId) : props.onRatingClick} />;
}
