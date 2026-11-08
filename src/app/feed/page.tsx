import { ArchivePageHeading } from "@/components/archive/archive-page-heading";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { FeedActivityFilter } from "./activity-filter";
import { buttonVariants } from "@/components/ui/button";
import { ArchiveTooltip } from "@/components/ui/archive-tooltip";
import { getFeedFriends, getFeedPage, getFeedMediaTiles } from "@/db/queries/feed";
import { getEffectiveMediaTypeOptions } from "@/db/queries/media-types";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { parseFeedCursor, type FeedPosition } from "@/lib/feed/model";
import { FeedDayGroups } from "./day-groups";

export const metadata: Metadata = { title: "Лента", description: "Новое в архиве и активность друзей." };
export const dynamic = "force-dynamic";

type FeedSearchParams = { end?: string | string[]; before?: string | string[]; after?: string | string[]; friends?: string | string[]; friend?: string | string[]; mine?: string | string[] };

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedSearchParams> }) {
  const query = await searchParams;
  const header = await getPublicSiteHeaderState();
  const friends = header.author ? await getFeedFriends(header.author.id) : [];
  const requestedFriendId = typeof query.friend === "string" && /^[1-9]\d{0,9}$/.test(query.friend) ? Number(query.friend) : undefined;
  const friendId = friends.find(friend => friend.id === requestedFriendId)?.id;
  const mineOnly = query.mine === "1" && !!header.author;
  const friendsOnly = !mineOnly && (friendId !== undefined || (friends.length > 0 && query.friends === "1"));
  const startHref = mineOnly ? "/feed?mine=1" : friendId !== undefined ? `/feed?friend=${friendId}` : friendsOnly ? "/feed?friends=1" : "/feed";
  if (query.friend !== undefined && friendId === undefined) redirect("/feed");
  const pageHref = (direction: "before" | "after", cursor: string) => `${startHref}${friendsOnly || mineOnly ? "&" : "?"}${direction}=${cursor}`;
  let position: FeedPosition | undefined;
  if (query.before !== undefined || query.after !== undefined) {
    if (query.before !== undefined && query.after !== undefined) redirect(startHref);
    const raw = query.before ?? query.after;
    const cursor = typeof raw === "string" ? parseFeedCursor(raw) : null;
    if (!cursor) redirect(startHref);
    position = { direction: query.before !== undefined ? "older" : "newer", cursor };
  }
  const oldest = !position && query.end === "1";
  const endHref = `${startHref}${friendsOnly || mineOnly ? "&" : "?"}end=1`;
  const types = await getEffectiveMediaTypeOptions(header.author?.id);
  const page = await getFeedPage({ friendsOnly, mineOnly, friendId, authorId: header.author?.id, mediaTypeCodes: types.filter(type => type.isEnabled).map(type => type.code), position, oldest });

  const tiles = await getFeedMediaTiles(page.items, header.author?.id);

  return <main className="archive-page flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
    <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-3">
      <PublicSiteHeader {...header.headerProps} />
      <section className="archive-paper archive-panel media-carrier-font-pc-steam px-4 pb-6 pt-4 sm:px-6 sm:pb-6 sm:pt-6 [&_*]:[font-family:inherit]" aria-labelledby="feed-title">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 pb-4">
          <ArchivePageHeading id="feed-title" title="Лента" description="Хроника событий архива" />
          {header.author ? <FeedActivityFilter friends={friends} value={mineOnly ? "mine" : friendId !== undefined ? String(friendId) : friendsOnly ? "friends" : "all"} /> : null}
        </div>
        {page.items.length === 0 ? <p className="py-6 text-sm text-stone-600">{position ? "На этой странице больше нет событий. Вернись к началу ленты." : "В ленте пока нет событий."}</p> :
          <FeedDayGroups items={page.items} currentAuthorId={header.author?.id} tiles={tiles} ratingAuthor={header.author ? { name: header.author.name, code: header.author.code } : null} />}
        <nav aria-label="Страницы ленты" className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-400/25 pt-5">
          {[
            { label: "К первым событиям", href: page.older ? endHref : null, Icon: ChevronFirst },
            { label: "К более старым событиям", href: page.older ? pageHref("before", page.older) : null, Icon: ChevronLeft },
            { label: "К более новым событиям", href: page.newer ? pageHref("after", page.newer) : null, Icon: ChevronRight },
            { label: "К последним событиям", href: page.newer ? startHref : null, Icon: ChevronLast },
          ].map(({ label, href, Icon }) => {
            const className = buttonVariants({ variant: "outline", size: "icon", className: "h-10 w-10" });
            return <ArchiveTooltip key={label} label={label} portal>
              {href ? <Link prefetch={false} href={href} aria-label={label} className={className}><Icon className="size-4" aria-hidden="true" /></Link>
                : <button type="button" disabled aria-label={label} className={className}><Icon className="size-4" aria-hidden="true" /></button>}
            </ArchiveTooltip>;
          })}
        </nav>
      </section>
    </div>
  </main>;
}
