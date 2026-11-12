import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminMediaBrowserFilterOptions } from "@/db/queries/admin-media-browser";
import { getAdminTierList, getAdminTierItems, getTierListAdminAuthor, getTierListSettings, getTierTemplates } from "@/db/queries/tier-lists";
import { tierEntryIds } from "@/lib/tier-lists/model";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "../../../admin-ui";
import { TierListForm } from "../../tier-list-form";
import { TierListToasts } from "../../tier-list-toasts";

export default async function EditAdminTierListPage({params,searchParams}: {
  params:Promise<{publicId:string}>;searchParams:Promise<{error?:string;saved?:string}>;
}) {
  const {publicId}=await params;
  const initial=await getAdminTierList(publicId);
  if(!initial)notFound();
  const [defaultAuthor,templates,limits,items,{mediaTypes,series},messages]=await Promise.all([
    getTierListAdminAuthor(initial.authorId,true),getTierTemplates(),getTierListSettings(),getAdminTierItems(tierEntryIds(initial.distribution),initial.authorId),getAdminMediaBrowserFilterOptions(),searchParams,
  ]);
  if(!defaultAuthor)notFound();
  return <div className="grid gap-5">
    <PageHeader title="Редактировать тир-лист" aside={<Link href="/admin/tier-lists" className={buttonVariants({variant:"outline"})}>К списку</Link>} />
    <TierListToasts error={messages.error} saved={messages.saved} />
    <TierListForm key={initial.publicId} templates={templates} limits={limits} defaultAuthor={defaultAuthor} initial={initial} items={items} mediaTypes={mediaTypes} series={series} />
  </div>;
}
