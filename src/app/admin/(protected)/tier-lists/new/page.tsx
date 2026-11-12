import Link from "next/link";

import { getAdminMediaBrowserFilterOptions } from "@/db/queries/admin-media-browser";
import { getDefaultTierListAdminAuthor, getTierListSettings, getTierTemplates } from "@/db/queries/tier-lists";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, EmptyState } from "../../admin-ui";
import { TierListForm } from "../tier-list-form";

export default async function NewAdminTierListPage() {
  const [defaultAuthor, templates, limits, {mediaTypes, series}] = await Promise.all([
    getDefaultTierListAdminAuthor(), getTierTemplates(), getTierListSettings(), getAdminMediaBrowserFilterOptions(),
  ]);
  return <div className="grid gap-5">
    <PageHeader title="Новый тир-лист" aside={<Link href="/admin/tier-lists" className={buttonVariants({variant:"outline"})}>К списку</Link>} />
    {!defaultAuthor ? <EmptyState>Создайте системного автора «Редакция» в <Link className="underline" href="/admin/authors/new">разделе авторов</Link>.</EmptyState>
      : !templates.length ? <EmptyState>Сначала добавьте шаблон в настройках тир-листов.</EmptyState>
      : <TierListForm templates={templates} limits={limits} defaultAuthor={defaultAuthor} items={[]} mediaTypes={mediaTypes} series={series} />}
  </div>;
}
