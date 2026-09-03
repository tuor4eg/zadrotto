import Image from "next/image";
import Link from "next/link";
import { Edit3, Eye, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAdminEditorialCollections } from "@/db/queries/editorial-collections";
import { PageHeader } from "../admin-ui";
import { deleteCollectionAction } from "./actions";

function Actions({ id, isPublished, slug }: { id: number; isPublished: boolean; slug: string }) {
  return <div className="flex justify-end gap-2">
    <Link className={buttonVariants({ size: "icon", variant: "outline" })} aria-label={isPublished ? "Открыть на сайте" : "Предпросмотр"} href={isPublished ? `/collections/${slug}` : `/admin/collections/${id}/preview`}><Eye /></Link>
    <Link className={buttonVariants({ size: "icon", variant: "outline" })} aria-label="Изменить" href={`/admin/collections/${id}/edit`}><Edit3 /></Link>
    <ConfirmAction action={deleteCollectionAction} confirmLabel="Удалить" description="Подборка и редакционные комментарии будут удалены без возможности восстановления. Записи архива останутся на месте." fields={[{ name: "collectionId", value: id }]} title="Удалить подборку?" triggerAriaLabel="Удалить" triggerIcon={<Trash2 />} triggerLabel="Удалить" triggerSize="icon" />
  </div>;
}

export default async function CollectionsAdminPage() {
  const items = await getAdminEditorialCollections();
  return <div className="flex flex-col gap-5">
    <PageHeader title="Подборки" description="Редакционные списки записей архива." aside={<Link className={buttonVariants()} href="/admin/collections/new"><Plus />Создать</Link>} />
    {items.length === 0 ? <p className="rounded-md border bg-white p-6 text-sm text-stone-500">Подборок пока нет.</p> : null}
    <div className="grid gap-3 md:hidden">{items.map((item) => <article key={item.id} className="grid grid-cols-[96px_1fr] gap-3 rounded-md border bg-white p-3">
      <div className="relative aspect-video overflow-hidden rounded bg-stone-100">{item.coverUrl ? <Image fill unoptimized className="object-cover" alt="" src={item.coverUrl} /> : null}</div>
      <div className="min-w-0"><h2 className="truncate font-medium">{item.title}</h2><div className="mt-2 flex gap-2"><Badge variant={item.publicationStatus === "published" ? "default" : "outline"}>{item.publicationStatus === "published" ? "Опубликована" : "Черновик"}</Badge><span className="text-sm text-stone-500">{item.itemsCount} зап.</span></div><div className="mt-3"><Actions id={item.id} isPublished={item.publicationStatus === "published"} slug={item.slug} /></div></div>
    </article>)}</div>
    {items.length ? <TableWrap className="hidden md:block"><Table><THead><tr><TH>Подборка</TH><TH>Статус</TH><TH>Записей</TH><TH>Изменена</TH><TH className="text-right">Действия</TH></tr></THead><TBody>{items.map((item) => <TR key={item.id}><TD className="font-medium">{item.title}</TD><TD><Badge variant={item.publicationStatus === "published" ? "default" : "outline"}>{item.publicationStatus === "published" ? "Опубликована" : "Черновик"}</Badge></TD><TD>{item.itemsCount}</TD><TD>{item.updatedAt.toLocaleString("ru-RU")}</TD><TD><Actions id={item.id} isPublished={item.publicationStatus === "published"} slug={item.slug} /></TD></TR>)}</TBody></Table></TableWrap> : null}
  </div>;
}
