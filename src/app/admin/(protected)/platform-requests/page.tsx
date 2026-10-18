import { requireAdminUser } from "@/lib/auth/admin-auth";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getPlatformRequestsPage } from "@/db/queries/platform-requests";
import { AdminToasts } from "../admin-toasts";
import { PageHeader } from "../admin-ui";
import { PlatformRequestsList } from "./request-list";
import { PlatformRequestSearch } from "./search";
import { platformRequestError } from "./presentation";

export default async function PlatformRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string; q?: string; page?: string }> }) {
  await requireAdminUser();
  const query = await searchParams;
  const all = query.tab === "all";
  const searchQuery = query.q ?? "";
  const result = await getPlatformRequestsPage({ all, searchQuery, page: Number(query.page ?? 1) });
  const pageUrl = (page: number) => `/admin/platform-requests?${new URLSearchParams({ ...(all ? { tab: "all" } : {}), ...(searchQuery ? { q: searchQuery } : {}), page: String(page) })}`;
  const tabUrl = (showAll: boolean) => {
    const params = new URLSearchParams({ ...(showAll ? { tab: "all" } : {}), ...(searchQuery ? { q: searchQuery } : {}) });
    return `/admin/platform-requests${params.size ? `?${params}` : ""}`;
  };
  const error = platformRequestError(query.error);
  return <div className="grid gap-5">
    <PageHeader title="Заявки на платформы" description="Неизвестные платформы провайдеров, ожидающие решения." />
    <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
    <nav aria-label="Статус заявок на платформы" className="flex flex-wrap gap-2">
      <Link href={tabUrl(false)} aria-current={!all ? "page" : undefined} className={buttonVariants({ variant: all ? "outline" : "default", size: "sm" })}>Ожидают решения</Link>
      <Link href={tabUrl(true)} aria-current={all ? "page" : undefined} className={buttonVariants({ variant: all ? "default" : "outline", size: "sm" })}>Все заявки</Link>
    </nav>
    <PlatformRequestSearch searchQuery={searchQuery} all={all} />
    <p className="text-sm text-stone-500">Заявок: {result.total}</p>
    <PlatformRequestsList requests={result.items} all={all} searching={Boolean(searchQuery)} />
    {result.totalPages > 1 ? <nav aria-label="Страницы заявок на платформы" className="flex flex-wrap items-center gap-3">
      {result.page > 1 ? <Link href={pageUrl(result.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
      <span className="text-sm text-stone-500">{result.page} / {result.totalPages}</span>
      {result.page < result.totalPages ? <Link href={pageUrl(result.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
    </nav> : null}
  </div>;
}
