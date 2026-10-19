import { IgnoredCreators } from "./ignored-creators";
import { CreatorProviderVariants } from "./provider-variants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Pencil, Eye } from "lucide-react";
import { getCreators, getCreatorTypes, getCreatorRoles, getCreatorProviderVariants, getCreatorProviderBindings } from "@/db/queries/creators";
import { buttonVariants } from "@/components/ui/button";
import { CreatorSearch } from "./creator-search";
import { PaginationNav } from "@/components/pagination-nav";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { parsePage } from "@/lib/common/pagination";
import { EmptyState, PageHeader } from "../admin-ui";
import { AdminToasts } from "../admin-toasts";

export default async function CreatorsAdminPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; q?: string; type?: string; role?: string; page?: string; error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  if (query.tab === "requests") redirect("/admin/creator-requests");
  if (query.tab === "dictionaries") redirect("/admin/creators/types");
  const ignored = query.tab === "ignored";
  const tabs = <nav aria-label="Статус создателей" className="flex flex-wrap gap-2">
    <Link href="/admin/creators" aria-current={!ignored ? "page" : undefined} className={buttonVariants({ variant: ignored ? "outline" : "default", size: "sm" })}>Обычные</Link>
    <Link href="/admin/creators?tab=ignored" aria-current={ignored ? "page" : undefined} className={buttonVariants({ variant: ignored ? "default" : "outline", size: "sm" })}>Игнорируемые значения</Link>
  </nav>;
  if (ignored) return <div className="grid gap-5">
    <PageHeader title="Создатели" description="Люди и организации, связанные с записями архива." />
    <AdminToasts clearParams={["error", "updated"]} messages={query.error ? [{ id: "error", tone: "error", text: "Не удалось вернуть значение на апрув. Проверьте его состояние." }] : query.updated ? [{ id: "updated", tone: "success", text: "Значение возвращено на апрув." }] : []} />
    {tabs}
    <IgnoredCreators />
  </div>;
  const q = query.q?.trim() ?? "";
  const typeCode = query.type ?? "";
  const roleCode = query.role ?? "";
  const [result, types, roles] = await Promise.all([getCreators({ q, typeCode, roleCode, page: parsePage(query.page), pageSize: 24 }), getCreatorTypes(), getCreatorRoles()]);
  const creatorIds = result.items.map(creator => creator.id);
  const [variants, bindings] = await Promise.all([getCreatorProviderVariants(creatorIds), getCreatorProviderBindings(creatorIds)]);
  const typeNames = new Map(types.map(type => [type.id, type.name]));
  return <div className="grid gap-5">
    <PageHeader title="Создатели" description="Люди и организации, связанные с записями архива." aside={<Link href="/admin/creators/new" className={buttonVariants()}><Plus className="size-4" />Добавить создателя</Link>} />
    <AdminToasts clearParams={["error", "updated"]} messages={query.error ? [{ id: "error", tone: "error", text: "Не удалось выполнить действие. Используемого создателя удалить нельзя." }] : query.updated ? [{ id: "updated", tone: "success", text: "Изменения сохранены." }] : []} />
    {tabs}
    <CreatorSearch searchQuery={q} typeCode={typeCode} roleCode={roleCode} types={types} roles={roles} />
    {!result.items.length ? <EmptyState>Создатели не найдены.</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{result.items.map(creator => <article key={creator.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-4"><span className="font-medium">{creator.name}</span><p className="text-sm text-stone-500">{typeNames.get(creator.typeId)}</p><p className="break-all font-mono text-xs text-stone-500">{creator.slug}</p><CreatorProviderVariants variants={variants.filter(variant => variant.creatorId === creator.id)} bindings={bindings.filter(binding => binding.creatorId === creator.id)} /><div className="flex flex-wrap gap-2"><Link href={`/archive?creator=${encodeURIComponent(creator.slug)}`} aria-label={`Посмотреть ${creator.name}`} title="Посмотреть" className={buttonVariants({ variant: "outline", size: "icon" })}><Eye className="size-4" aria-hidden="true" /></Link><Link aria-label={`Редактировать ${creator.name}`} href={`/admin/creators/${creator.id}/edit`} className={buttonVariants({ variant: "outline", size: "icon" })}><Pencil className="size-4" /></Link></div></article>)}</div>
      <TableWrap className="hidden md:block"><Table><THead><TR><TH>Имя</TH><TH>Тип</TH><TH>Slug</TH><TH>Соответствия провайдеров</TH><TH>Действия</TH></TR></THead><TBody>{result.items.map(creator => <TR key={creator.id}><TD><span className="font-medium">{creator.name}</span>{creator.originalName ? <p className="mt-1 text-xs text-stone-500">{creator.originalName}</p> : null}</TD><TD>{typeNames.get(creator.typeId)}</TD><TD className="break-all font-mono text-xs">{creator.slug}</TD><TD><CreatorProviderVariants variants={variants.filter(variant => variant.creatorId === creator.id)} bindings={bindings.filter(binding => binding.creatorId === creator.id)} /></TD><TD><div className="flex flex-wrap gap-2"><Link href={`/archive?creator=${encodeURIComponent(creator.slug)}`} aria-label={`Посмотреть ${creator.name}`} title="Посмотреть" className={buttonVariants({ variant: "outline", size: "icon" })}><Eye className="size-4" aria-hidden="true" /></Link><Link aria-label={`Редактировать ${creator.name}`} href={`/admin/creators/${creator.id}/edit`} className={buttonVariants({ variant: "outline", size: "icon" })}><Pencil className="size-4" /></Link></div></TD></TR>)}</TBody></Table></TableWrap>
    </>}
    <PaginationNav basePath="/admin/creators" itemLabel="создателей" page={result.page} pageSize={result.pageSize} searchParams={{ q: q || undefined, type: typeCode || undefined, role: roleCode || undefined }} totalCount={result.totalCount} totalPages={result.totalPages} />
  </div>;
}
