import { getCreatorAvatarState, getCreatorFantlabBindings } from "@/db/queries/creator-avatars";
import { CreatorAvatarEditor } from "../../creator-avatar-editor";
import { CreatorFantlabBindings } from "../../creator-fantlab-bindings";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminCreatorById, getCreatorTypes, getCreatorOptions, getCreatorProviderBindings } from "@/db/queries/creators";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { PageHeader } from "../../../admin-ui";
import { AdminToasts } from "../../../admin-toasts";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteCreatorAction } from "../../actions";
import { CreatorProviderVariants } from "../../provider-variants";
import { CreatorForm } from "../../creator-form";

export default async function EditCreatorPage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{error?:string;updated?:string;avatarError?:string;avatarUpdated?:string;avatarQueued?:string;fantlabAuthor?:string}>}) {
  const [{id}, query, types, series, creators] = await Promise.all([params,searchParams,getCreatorTypes(),getAdminFranchiseOptions(), getCreatorOptions()]);
  const creatorId = Number(id);
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) notFound();
  const creator = await getAdminCreatorById(creatorId);
  if (!creator) notFound();
  const [avatar, bindings, providerBindings] = await Promise.all([getCreatorAvatarState(creatorId), getCreatorFantlabBindings(creatorId), getCreatorProviderBindings(creatorId)]);
  return <div className="grid gap-5"><PageHeader title="Редактирование создателя" description={creator.name} aside={<Link href="/admin/creators" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="size-4" />Назад</Link>}/>
    <AdminToasts clearParams={["error","updated"]} messages={query.error ? [{id:"error",tone:"error",text:"Не удалось сохранить. Проверьте поля и уникальность slug."}] : query.updated ? [{id:"updated",tone:"success",text:"Создатель сохранён."}] : []}/>
    <AdminToasts clearParams={["avatarError", "avatarUpdated", "avatarQueued", "fantlabAuthor"]} messages={query.avatarError ? [{id:"avatar-error",tone:"error",text:query.avatarError === "binding" ? "Не удалось подтвердить привязку FantLab: проверьте ID и конфликты с другими создателями." : "Не удалось обновить аватар. Проверьте изображение и повторите попытку."}] : query.avatarQueued ? [{id:"avatar-queued",tone:"success",text:"Обновление аватара поставлено в очередь. Результат доступен в заданиях."}] : query.avatarUpdated ? [{id:"avatar-updated",tone:"success",text:query.fantlabAuthor ? `Подтверждён автор FantLab: ${query.fantlabAuthor}` : "Данные аватара сохранены."}] : []}/>
    <div className="max-w-3xl"><CreatorAvatarEditor creatorId={creatorId} authorName={creator.name} avatarObjectKey={avatar?.avatarObjectKey ?? null}/><p className="mt-2 text-sm text-stone-500">Источник: {avatar?.avatarSource === "manual" ? "ручная аватарка" : avatar?.avatarSource === "fantlab" ? "FantLab" : "нет изображения"}{avatar?.avatarSourceExternalId ? ` · Автор #${avatar.avatarSourceExternalId}` : ""}{avatar?.avatarFetchedAt ? ` · Импорт: ${avatar.avatarFetchedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}` : ""}</p>{avatar?.avatarSourceUrl ? <a href={avatar.avatarSourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Страница источника</a> : null}</div>
    <CreatorFantlabBindings creatorId={creatorId} bindings={bindings} variants={creator.providerVariants}/>
    <CreatorForm creator={creator} types={types} series={series} creators={creators}/>
    {creator.inheritedSeries.length ? <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Серии через псевдонимы</h2>
      <p className="text-sm text-stone-500">Показываются автоматически. Изменить эти связи можно у соответствующего псевдонима.</p>
      {creator.inheritedSeries.map(series => <div key={`${series.sourceCreatorId}:${series.id}`} className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
        <Link href={`/admin/series/${series.id}/edit`} className="underline underline-offset-4">{series.title}</Link>
        <span className="text-stone-500">через псевдоним <Link href={`/admin/creators/${series.sourceCreatorId}/edit`} className="underline underline-offset-4">{series.sourceCreatorName}</Link></span>
      </div>)}
    </section> : null}
    {creator.providerVariants.length || providerBindings.length ? <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5"><h2 className="font-semibold">Значения провайдеров</h2><CreatorProviderVariants variants={creator.providerVariants} bindings={providerBindings}/></section> : null}
    <div><ConfirmAction action={deleteCreatorAction} fields={[{name:"id",value:creator.id}]} title="Удалить создателя?" description="Удаление доступно только если у создателя нет связей с записями, сериями и провайдерами." confirmLabel="Удалить" triggerLabel="Удалить создателя" triggerVariant="destructive" /></div>
  </div>;
}
