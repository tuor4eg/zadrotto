import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import Link from "next/link";
import { EditorialEntryGroupTile } from "@/components/archive/editorial-entry-group-tile";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";

export function EditorialCollectionEntryCard({ item, currentAuthorStatus, editorialComment = null, currentAuthor, ratingAuthor = null }: EditorialCollectionGroupItem & {
  editorialComment?: string | null;
  currentAuthor: boolean;
  ratingAuthor?: { name: string; code: string } | null;
}) {
  const { displayTitle, displayOriginalTitle } = resolveMediaItemDisplayTitles(item);
  return <div className="grid min-w-0 grid-cols-[8rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
    <div className="w-32 min-w-0 sm:w-36">
      <EditorialEntryGroupTile item={{ ...item, title: displayTitle }} currentAuthorStatus={currentAuthorStatus} currentAuthor={currentAuthor} ratingAuthor={ratingAuthor} horizontalScroll={false} />
    </div>
    <div className="contents sm:block">
      <div className="col-start-2 min-w-0 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/media/${item.code}`} className="font-semibold leading-tight text-stone-950 hover:underline hover:underline-offset-4">{displayTitle}</Link>
          {displayOriginalTitle ? <span className="text-sm text-stone-500">{displayOriginalTitle}</span> : null}
        </div>
      </div>
      {editorialComment ? <p className="col-span-2 max-w-3xl text-sm leading-6 text-stone-700 sm:mt-4">{editorialComment}</p> : null}
    </div>
  </div>;
}
