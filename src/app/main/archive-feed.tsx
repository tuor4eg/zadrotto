import Link from "next/link";
import { Clock3 } from "lucide-react";
import { FeedEventCard } from "@/app/feed/event-card";
import type { FeedItem } from "@/lib/feed/model";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";

export function ArchiveFeed({ items, tiles, currentAuthor }: {
  items: FeedItem[];
  tiles: EditorialCollectionGroupItem[];
  currentAuthor: { id: number; name: string; code: string } | null;
}) {
  const tileById = new Map(tiles.map(tile => [tile.mediaItemId, tile]));
  return <section className="archive-paper archive-panel overflow-hidden p-4 sm:p-5" aria-labelledby="main-archive-feed-title">
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 id="main-archive-feed-title" className="media-carrier-font-pc-steam flex items-center gap-2 text-2xl leading-none text-stone-950">
        <Clock3 aria-hidden="true" className="size-5 shrink-0 text-red-950/70" />
        Новое в архиве
      </h2>
      <Link href="/feed" className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 hover:text-red-950">Смотреть всё →</Link>
    </div>
    <div className="media-carrier-font-pc-steam [&_*]:[font-family:inherit]">
      {items.length > 0 ? <ol className="archive-scrollbar flex snap-x snap-proximity gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.slice(0, 5).map((item, index) => <li key={item.key} className={`w-72 min-w-0 shrink-0 snap-start md:w-auto ${index === 4 ? "md:hidden 2xl:block" : index === 3 ? "md:hidden xl:block" : index === 2 ? "md:hidden lg:block" : ""}`}>
          <FeedEventCard item={item} tile={item.mediaItemId ? tileById.get(item.mediaItemId) : undefined} currentAuthorId={currentAuthor?.id} ratingAuthor={currentAuthor} horizontalScroll />
        </li>)}
      </ol>
        : <p className="py-12 text-center text-xs text-stone-500">В архиве пока ничего нового.</p>}
    </div>
  </section>;
}
