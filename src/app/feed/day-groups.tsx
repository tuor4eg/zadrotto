import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";
import type { FeedItem } from "@/lib/feed/model";
import { FeedEventCard } from "./event-card";
import { groupFeedItemsByDay } from "./presentation";

export function FeedDayGroups({ items, currentAuthorId, tiles = [], ratingAuthor = null }: {
  items: FeedItem[];
  currentAuthorId?: number;
  tiles?: EditorialCollectionGroupItem[];
  ratingAuthor?: { name: string; code: string } | null;
}) {
  const tileById = new Map(tiles.map(tile => [tile.mediaItemId, tile]));
  return <div className="space-y-5">
    {groupFeedItemsByDay(items).map(group => <section key={group.day} aria-labelledby={`feed-day-${group.day}`}>
      <h2 id={`feed-day-${group.day}`} className="mb-5 flex items-center gap-3 text-xl text-stone-800">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-stone-500" />
        <time dateTime={group.day}>{group.label}</time>
        <span aria-hidden="true" className="h-px flex-1 bg-stone-400/25" />
      </h2>
      <ol className="grid gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.items.map(item => <li key={item.key} className="min-w-0">
          <FeedEventCard item={item} tile={item.mediaItemId ? tileById.get(item.mediaItemId) : undefined} currentAuthorId={currentAuthorId} ratingAuthor={ratingAuthor} />
        </li>)}
      </ol>
    </section>)}
  </div>;
}
