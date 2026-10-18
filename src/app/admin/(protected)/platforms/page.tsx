import { reopenPlatformMappingAction } from "./actions";
import Link from "next/link";
import { Edit3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminPlatformsPage, type AdminPlatform } from "@/db/queries/platforms";
import { AdminToasts } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { getPlatformErrorMessage } from "./messages";
import { PlatformProviderVariants } from "./provider-variants";
import { PlatformSearch } from "./platform-search";
import { CancelledPlatforms } from "./cancelled-platforms";

function PlatformIdentity({ platform }: { platform: AdminPlatform }) {
  return <div className="min-w-0">
    <div className="break-words font-medium text-stone-950">{platform.name}</div>
    <div className="mt-1 break-all font-mono text-xs text-stone-500">{platform.slug}</div>
    {!platform.isActive ? <Badge variant="warning" className="mt-2">Неактивна</Badge> : null}
  </div>;
}

function PlatformEditLink({ platform }: { platform: AdminPlatform }) {
  return <Link href={`/admin/platforms/${platform.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}
    aria-label={`Редактировать платформу ${platform.name}`}><Edit3 />Редактировать</Link>;
}

export default async function PlatformsPage({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; page?: string; tab?: string }> }) {
  const query = await searchParams;
  const searchQuery = query.q ?? "";
  const cancelled = query.tab === "cancelled";
  const tabs = <nav aria-label="Статус платформ" className="flex flex-wrap gap-2">
    <Link href="/admin/platforms" aria-current={!cancelled ? "page" : undefined} className={buttonVariants({ variant: cancelled ? "outline" : "default", size: "sm" })}>Обычные</Link>
    <Link href="/admin/platforms?tab=cancelled" aria-current={cancelled ? "page" : undefined} className={buttonVariants({ variant: cancelled ? "default" : "outline", size: "sm" })}>Отменённые</Link>
  </nav>;
  if (cancelled) return <div className="grid gap-5">
    <PageHeader title="Платформы" description="Названия платформ в карточках записей и их варианты у провайдеров." />
    <AdminToasts clearParams={["error"]} messages={query.error === "restore" ? [{ id: "restore", tone: "error", text: "Не удалось восстановить платформу. Возможно, решение ещё применяется или значение уже изменено." }] : []} />
    {tabs}<PlatformSearch searchQuery={searchQuery} cancelled />
    <CancelledPlatforms searchQuery={searchQuery} page={Number(query.page ?? 1)} />
  </div>;
  const result = await getAdminPlatformsPage({ searchQuery, page: Number(query.page ?? 1) });
  const platforms = result.items;
  const pageUrl = (page: number) => `/admin/platforms?${new URLSearchParams({ ...(searchQuery ? { q: searchQuery } : {}), page: String(page) })}`;
  const error = getPlatformErrorMessage(query.error);
  return (
    <div className="grid gap-5">
      <PageHeader title="Платформы" description="Названия платформ в карточках записей и их варианты у провайдеров." />
      <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
      {tabs}<PlatformSearch searchQuery={searchQuery} />
      <p className="text-sm text-stone-500">Платформ: {result.total}</p>
      {platforms.length === 0 ? <EmptyState>{searchQuery ? "Платформы не найдены." : "Платформы пока не добавлены."}</EmptyState> : <>
        <div className="grid gap-3 md:hidden">
          {platforms.map((platform) => <article key={platform.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
            <PlatformIdentity platform={platform} />
            <div className="mt-4"><p className="mb-2 text-xs font-medium text-stone-500">Варианты у провайдеров</p>
              <PlatformProviderVariants groups={platform.providerVariants} reopenAction={reopenPlatformMappingAction} /></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-stone-600">Записей: {platform.mediaItemsCount}</span><PlatformEditLink platform={platform} />
            </div>
          </article>)}
        </div>
        <TableWrap className="hidden md:block">
          <Table className="table-fixed">
            <THead><tr><TH className="w-1/4">Наша платформа</TH><TH>Варианты у провайдеров</TH>
              <TH className="w-24">Записей</TH><TH className="w-44 text-right">Действия</TH></tr></THead>
            <TBody>{platforms.map((platform) => <TR key={platform.id}>
              <TD><PlatformIdentity platform={platform} /></TD><TD><PlatformProviderVariants groups={platform.providerVariants} reopenAction={reopenPlatformMappingAction} /></TD>
              <TD><Badge variant="outline">{platform.mediaItemsCount}</Badge></TD><TD className="text-right"><PlatformEditLink platform={platform} /></TD>
            </TR>)}</TBody>
          </Table>
        </TableWrap>
      </>}
      {result.totalPages > 1 ? <nav aria-label="Страницы платформ" className="flex flex-wrap items-center gap-3">
        {result.page > 1 ? <Link href={pageUrl(result.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
        <span className="text-sm text-stone-500">{result.page} / {result.totalPages}</span>
        {result.page < result.totalPages ? <Link href={pageUrl(result.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
      </nav> : null}
    </div>
  );
}
