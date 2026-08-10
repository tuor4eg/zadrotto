import Link from "next/link";

import { FriendshipControls } from "@/app/users/friendship-controls";
import { PaginationNav } from "@/components/pagination-nav";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
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
  const currentUrl = `/author/friends?${new URLSearchParams({ tab, ...(searchQuery ? { q: searchQuery } : {}) }).toString()}`;

  return <div className="space-y-5">
    <div><h2 className="font-serif text-3xl">Друзья</h2><p className="mt-1 text-stone-600">Заявки и пользователи, которых вы добавили в друзья.</p></div>
    {query.friendship === "error" || query.friendship === "conflict" ? <Alert variant="destructive">Не удалось изменить состояние дружбы. Обновите страницу и попробуйте ещё раз.</Alert> : null}
    <nav aria-label="Разделы друзей" className="flex flex-wrap gap-2 border-b border-stone-300/70 pb-3">
      {FRIENDS_TABS.map((item) => <Link key={item} href={`/author/friends?tab=${item}`} className={`${buttonVariants({ variant: item === tab ? "default" : "outline", size: "sm" })} relative`}>{labels[item]}{item === "incoming" ? <NotificationBadge count={incomingFriendRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" /> : null}</Link>)}
    </nav>
    {tab === "search" ? <form method="get" action="/author/friends" className="flex flex-col gap-2 sm:flex-row"><input type="hidden" name="tab" value="search" /><Input name="q" defaultValue={searchQuery} placeholder="Имя пользователя" className="max-w-xl" /><button className={buttonVariants({ variant: "default" })} type="submit">Найти</button></form> : null}
    {tab === "search" && !searchQuery ? <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-stone-600">Введите имя пользователя.</p> : result.items.length ? <div className="divide-y divide-stone-200 rounded-md border border-stone-200">
      {result.items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 p-4">
        <Link href={`/users/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={item.name} objectKey={item.avatarObjectKey} /><span className="break-words font-medium hover:text-red-950">{item.name}</span></Link>
        <FriendshipControls compact returnTo={currentUrl} state={item.relationState} targetId={item.id} />
      </div>)}
    </div> : <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-stone-600">Ничего не найдено.</p>}
    <PaginationNav basePath="/author/friends" itemLabel="пользователей" page={result.page} pageSize={result.pageSize} searchParams={{ tab, q: searchQuery || undefined }} totalCount={result.totalCount} totalPages={result.totalPages} variant="archive" />
  </div>;
}
