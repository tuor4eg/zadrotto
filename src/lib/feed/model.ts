export const FEED_PAGE_SIZE = 50;
export const FEED_KINDS = ["media", "series", "review", "collection", "rating", "wanted", "achievement"] as const;
export type FeedKind = typeof FEED_KINDS[number];
export type FeedCursor = { at: string; kind: number; id: number };
export type FeedPosition = { direction: "older" | "newer"; cursor: FeedCursor };
export type FeedItem = {
  key: string;
  kind: FeedKind;
  cursor: FeedCursor;
  href: string;
  title: string;
  imageUrl: string | null;
  mediaItemId?: number | null;
  mediaTypeName?: string | null;
  releaseYear?: number | null;
  actorName: string | null;
  actorId: number | null;
  actorIsFriend: boolean;
  score: number | null;
  partLabel: string | null;
  reviewTitle: string | null;
};

export function encodeFeedCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseFeedCursor(value: string): FeedCursor | null {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    const row = cursor as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "at,id,kind") return null;
    if (typeof row.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.at)) return null;
    if (row.at.startsWith("0000-")) return null;
    const date = new Date(row.at);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 23) !== row.at.slice(0, 23)) return null;
    if (typeof row.kind !== "number" || !Number.isInteger(row.kind) || row.kind < 1 || row.kind > FEED_KINDS.length) return null;
    if (typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id < 1 || row.id > 2147483647) return null;
    return row as FeedCursor;
  } catch { return null; }
}

export function getFeedNavigation(items: FeedItem[], position: FeedPosition | undefined, hasMore: boolean, oldest = false) {
  return {
    newer: items.length > 0 && (position?.direction === "older" || (!position && oldest && hasMore) || (position?.direction === "newer" && hasMore))
      ? encodeFeedCursor(items[0].cursor) : null,
    older: items.length > 0 && (position?.direction === "newer" || (hasMore && (position !== undefined || !oldest)))
      ? encodeFeedCursor(items[items.length - 1].cursor) : null,
  };
}
