import { EditorialEntryGroupTile } from "@/components/archive/editorial-entry-group-tile";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Trophy } from "lucide-react";
import type { FeedItem } from "@/lib/feed/model";
import { FeedEventDescription } from "./event-description";

export function FeedEventCard({ item, tile, currentAuthorId, ratingAuthor = null, horizontalScroll = false }: {
  item: FeedItem;
  tile?: EditorialCollectionGroupItem;
  currentAuthorId?: number;
  ratingAuthor?: { name: string; code: string } | null;
  horizontalScroll?: boolean;
}) {
  const metadata = [item.mediaTypeName ?? tile?.item.mediaTypeName, item.releaseYear ?? tile?.item.releaseYear].filter(value => value !== null && value !== undefined && value !== "").join(" · ");
  return <div className="flex min-w-0 items-stretch gap-3">
          {tile ? <div className="w-32 min-w-0 shrink-0 sm:w-36">
            <EditorialEntryGroupTile {...tile} currentAuthor={currentAuthorId !== undefined} ratingAuthor={ratingAuthor} horizontalScroll={horizontalScroll} showMetadata={false} />
          </div> : <Link href={item.href} className={`relative block shrink-0 overflow-hidden bg-stone-800/10 ${item.kind === "achievement" ? "aspect-square w-32 self-start rounded-full sm:w-36" : item.kind === "series" ? "aspect-[2/3] w-32 rounded-md sm:w-36" : "h-24 w-16 rounded-md"}`} aria-label={item.title}>
            {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes={item.kind === "series" || item.kind === "achievement" ? "(min-width: 640px) 144px, 128px" : "64px"} className={item.kind === "achievement" ? "object-contain p-1" : "object-cover"} unoptimized />
              : <span className="grid h-full place-items-center text-stone-500">{item.kind === "achievement" ? <Trophy className="size-7" aria-hidden="true" /> : <BookOpen className="size-7" aria-hidden="true" />}</span>}
          </Link>}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="break-words text-sm leading-5 text-stone-700"><FeedEventDescription item={item} currentAuthorId={currentAuthorId} /></p>
            <Link href={item.href} className="mt-1 inline-block break-words text-lg leading-6 text-stone-950 underline-offset-4 hover:underline">{item.title}</Link>
            {item.partLabel ? <p className="mt-1 text-xs text-stone-600">{item.partLabel}</p> : null}
            {metadata ? <p className="mt-auto pt-2 text-xs leading-5 text-stone-500">{metadata}</p> : null}
          </div>
  </div>;
}
