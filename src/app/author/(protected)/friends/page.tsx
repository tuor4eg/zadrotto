import Link from "next/link";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { PaginationNav } from "@/components/pagination-nav";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { UsersSearch } from "./users-search";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { getFriendshipList, getIncomingFriendRequestCount, searchDiscoverableUsers } from "@/db/queries/friends";
import { requireAuthor } from "@/lib/auth/author-auth";
import { parsePage } from "@/lib/common/pagination";
import { FRIENDS_TABS, parseFriendsTab } from "@/lib/friends/model";
import { normalizeSearchText } from "@/lib/search/normalize";

const labels = { friends: "Друзья", incoming: "Входящие", outgoing: "Исходящие", search: "Поиск" } as const;

type Query = { friendship?: string; page?: string; q?: string; tab?: string };

export default async function FriendsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [author, query] = await Promise.all([requireAuthor(), searchParams]);
  const tab = parseFriendsTab(query.tab);
  const page = parsePage(query.page);
  const searchQuery = normalizeSearchText(query.q ?? "");
  const [result, incomingFriendRequestCount] = await Promise.all([
    tab === "search"
      ? searchDiscoverableUsers(author.id, searchQuery, page)
      : getFriendshipList(author.id, tab, page),
    getIncomingFriendRequestCount(author.id),
  ]);
  const currentUrl = `/author/friends?${new URLSearchParams({ tab, ...(searchQuery ? { q: searchQuery } : {}), ...(result.page > 1 ? { page: String(result.page) } : {}) }).toString()}`;

  return <div className="author-dashboard flex flex-1 flex-col">
    <div className="archive-paper-surface archive-panel min-w-0 flex-1 space-y-5 p-5 sm:p-6">
    <div><h2 className="font-serif text-3xl">Друзья</h2><p className="mt-1 text-stone-600">Заявки и пользователи, которых вы добавили в друзья</p></div>
    {query.friendship === "error" || query.friendship === "conflict" ? <Alert variant="destructive">Не удалось изменить состояние дружбы. Обновите страницу и попробуйте ещё раз.</Alert> : null}
    <nav aria-label="Разделы друзей" className="flex flex-wrap gap-2 border-b border-stone-300/70 pb-3">
      {FRIENDS_TABS.map((item) => <Link key={item} href={`/author/friends?tab=${item}`} className={`${buttonVariants({ variant: item === tab ? "default" : "outline", size: "sm" })} relative`}>{labels[item]}{item === "incoming" ? <NotificationBadge count={incomingFriendRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" /> : null}</Link>)}
    </nav>
    {tab === "search" ? <UsersSearch searchQuery={searchQuery} /> : null}
    <section aria-label={labels[tab]}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{tab === "search" ? "Пользователи" : labels[tab]}</h3>
        <p className="text-sm tabular-nums text-stone-600">Всего: {result.totalCount.toLocaleString("ru-RU")}</p>
      </div>
      {result.items.length ? <div>
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_8rem] gap-4 border-b border-stone-400/45 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500 sm:grid">
          <span>Пользователь</span><span>Статус</span><span className="text-right">Действия</span>
        </div>
        {result.items.map((item) => {
          const relationLabel = {
            self: "Это вы",
            none: "Не в друзьях",
            friends: "В друзьях",
            incoming: "Входящая заявка",
            outgoing: "Заявка отправлена",
          }[item.relationState];
          return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-stone-300/60 px-2 py-3 transition-colors last:border-b-0 hover:bg-stone-50/50 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_8rem] sm:gap-x-4 sm:px-3">
            <Link href={`/users/${item.id}`} className="group flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500">
              <Avatar name={item.name} objectKey={item.avatarObjectKey} className="size-11 shrink-0 text-sm sm:size-12" />
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold leading-tight text-stone-950 group-hover:underline group-hover:underline-offset-4">{item.name}</span>
                <span className="mt-1 block text-[10px] text-stone-500 sm:hidden">{relationLabel}</span>
              </span>
            </Link>
            <span className="hidden text-xs text-stone-600 sm:block">{relationLabel}</span>
            <div className="flex items-center justify-end gap-2">
              <FriendshipControls iconOnly returnTo={currentUrl} state={item.relationState} targetId={item.id} />
            </div>
          </div>;
        })}
      </div> : <p className="border-y border-stone-300/60 px-3 py-8 text-center text-sm text-stone-600">{tab === "friends" ? "Вы пока никого не добавили в друзья." : tab === "incoming" ? "Входящих заявок пока нет." : tab === "outgoing" ? "Отправленных заявок пока нет." : "Пользователи не найдены."}</p>}
    </section>
    <PaginationNav basePath="/author/friends" itemLabel="пользователей" page={result.page} pageSize={result.pageSize} searchParams={{ tab, q: searchQuery || undefined }} totalCount={result.totalCount} totalPages={result.totalPages} variant="archive" />
    </div>
  </div>;
}
