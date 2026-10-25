import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { getCreatorAvatarState } from "@/db/queries/creator-avatars";
import { CreatorAvatarEditor } from "../../creator-avatar-editor";
import { CreatorFantlabBindings } from "../../creator-fantlab-bindings";
import { creatorEditErrorMessage } from "@/lib/creators/editor";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminCreatorById, getCreatorTypes, getCreatorProviderBindings } from "@/db/queries/creators";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { PageHeader } from "../../../admin-ui";
import { AdminToasts } from "../../../admin-toasts";
import { refreshCreatorImageAction } from "../../avatar-actions";
import { canWriteCreatorImage, creatorImageCandidates } from "@/lib/creators/image-policy";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteCreatorAction } from "../../actions";
import { CreatorProviderVariants } from "../../provider-variants";
import { ProviderSnapshotControls } from "@/components/admin/provider-snapshot-controls";
import { CreatorForm } from "../../creator-form";

export default async function EditCreatorPage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{error?:string;updated?:string;avatarError?:string;avatarUpdated?:string;avatarQueued?:string;imageRun?:string;fantlabAuthor?:string}>}) {
  const [{id}, query, types, series] = await Promise.all([params,searchParams,getCreatorTypes(),getAdminFranchiseOptions()]);
  const creatorId = Number(id);
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) notFound();
  const creator = await getAdminCreatorById(creatorId);
  if (!creator) notFound();
  const [avatar, providerBindings] = await Promise.all([getCreatorAvatarState(creatorId), getCreatorProviderBindings(creatorId, true)]);
  const activeBindings = providerBindings.filter(binding => binding.active);
  const imageBindings = creatorImageCandidates(creator.typeCode, activeBindings).flatMap(candidate => candidate.bindings);
  const deleteReasons = [
    ...(providerBindings.length ? ["Сохранены действующие или исторические привязки провайдеров."] : []),
    ...(creator.providerVariants.length ? ["Есть соответствия имён провайдеров."] : []),
    ...(creator.roles.length ? ["Есть участия в записях."] : []),
    ...(creator.hasPseudonymAssignments ? ["Создатель выбран отображаемым псевдонимом в записях."] : []),
    ...(creator.seriesIds.length ? ["Есть прямые связи с сериями."] : []),
  ];
  return <div className="grid gap-5"><PageHeader title={creator.name} description={`Редактирование создателя · №${creator.id}`} aside={<Link href="/admin/creators" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="size-4" />Назад</Link>}/>
    <AdminToasts clearParams={["error","updated"]} messages={query.error ? [{id:"error",tone:"error",text:creatorEditErrorMessage(query.error)}] : query.updated ? [{id:"updated",tone:"success",text:"Создатель сохранён."}] : []}/>
    <AdminToasts clearParams={["avatarError", "avatarUpdated", "avatarQueued", "imageRun", "fantlabAuthor"]} messages={query.avatarError ? [{id:"avatar-error",tone:"error",text:query.avatarError === "protected" ? "Изображение защищено: ручное изображение или изображение другой внешней идентичности нельзя заменить этой операцией." : query.avatarError === "binding" ? "Не удалось подтвердить привязку FantLab: проверьте ID и конфликты с другими создателями." : "Не удалось обновить аватар. Проверьте изображение и повторите попытку."}] : query.avatarQueued ? [{id:"avatar-queued",tone:"success",text:"Обновление аватара поставлено в очередь. Результат доступен в заданиях."}] : query.avatarUpdated ? [{id:"avatar-updated",tone:"success",text:query.fantlabAuthor ? `Подтверждён автор FantLab: ${query.fantlabAuthor}` : "Данные аватара сохранены."}] : []}/>
    <div className="max-w-3xl"><CreatorAvatarEditor creatorType={creator.typeCode} creatorId={creatorId} authorName={creator.name} avatarObjectKey={avatar?.avatarObjectKey ?? null}/><p className="mt-2 text-sm text-stone-500">Источник: {avatar?.avatarSource === "manual" ? "ручная аватарка" : avatar?.avatarSource ? COVER_PROVIDER_LABELS[avatar.avatarSource] : "нет изображения"}{avatar?.avatarSourceExternalId ? ` · ID провайдера ${avatar.avatarSourceExternalId}` : ""}{avatar?.avatarFetchedAt ? ` · Импорт: ${avatar.avatarFetchedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}` : ""}</p>{avatar?.avatarSourceUrl ? <a href={avatar.avatarSourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Страница источника</a> : null}</div>
    {query.imageRun && /^\d+$/.test(query.imageRun) ? <Link className="text-sm underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${query.imageRun}`}>Открыть задачу обновления изображения №{query.imageRun}</Link> : null}
    <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Привязки к провайдерам</h2>
      <p className="text-sm text-stone-500">Привязка по ID подтверждает внешнюю идентичность. Соответствие имени хранится отдельно. Исторические привязки не используются для импорта и изображений.</p>
      <CreatorProviderVariants variants={creator.providerVariants} bindings={providerBindings}/>
      <Link href="/admin/creator-requests" className="text-sm underline">Подтвердить или исправить сопоставление через заявки</Link>
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Добавить привязку</summary>
        <div className="mt-3 grid gap-3">
          {creator.typeCode === "person" ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">FantLab · подтвердить ID автора</summary>
            <CreatorFantlabBindings creatorId={creatorId} creatorName={creator.name} bindings={activeBindings.filter(binding => binding.provider === "fantlab")} variants={creator.providerVariants}/>
          </details> : null}
          <p className="text-sm text-stone-500">Для остальных провайдеров выберите соответствующую заявку и сопоставьте её с этим создателем.</p>
          <Link href="/admin/creator-requests" className="text-sm underline">Выбрать заявку провайдера</Link>
        </div>
      </details>
    </section>
    <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Изображение из подтверждённого источника</h2>
      <p className="text-sm text-stone-500">Получает свежий профиль и изображение. Ручное изображение и изображение другого источника сохраняются.</p>
      {!imageBindings.length ? <p className="text-sm text-stone-500">Нет подтверждённого источника с поддержкой изображений. Проверьте привязки выше.</p> : null}
      {imageBindings.map(binding => <form key={binding.id} action={refreshCreatorImageAction}>
        <input type="hidden" name="creatorId" value={creatorId}/><input type="hidden" name="bindingId" value={binding.id}/>
        <Button variant="outline" disabled={Boolean(avatar && !canWriteCreatorImage(avatar, binding))}>Обновить из {COVER_PROVIDER_LABELS[binding.provider as keyof typeof COVER_PROVIDER_LABELS] ?? binding.provider} · {binding.externalCreatorId}</Button>
      </form>)}
      {avatar?.avatarObjectKey ? <p className="text-xs text-stone-500">Обновление доступно только из источника текущего изображения. Для смены источника сначала явно удалите изображение.</p> : null}
    </section>
    <ProviderSnapshotControls creatorId={creatorId} />
    {creator.roles.length ? <p className="text-sm text-stone-600">Роли в записях: {creator.roles.map(role => role.name).join(", ")}. Роли назначаются у соответствующих записей.</p> : <p className="text-sm text-stone-500">Участий в записях пока нет. Роль назначается при добавлении создателя к записи.</p>}
    <CreatorForm creator={creator} types={types} series={series} creators={creator.relations.map(relation => ({ id: relation.targetCreatorId, name: relation.name }))}/>
    {creator.inheritedSeries.length ? <section className="grid max-w-3xl gap-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Серии через псевдонимы</h2>
      <p className="text-sm text-stone-500">Показываются автоматически. Изменить эти связи можно у соответствующего псевдонима.</p>
      {creator.inheritedSeries.map(series => <div key={`${series.sourceCreatorId}:${series.id}`} className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
        <Link href={`/admin/series/${series.id}/edit`} className="underline underline-offset-4">{series.title}</Link>
        <span className="text-stone-500">через псевдоним <Link href={`/admin/creators/${series.sourceCreatorId}/edit`} className="underline underline-offset-4">{series.sourceCreatorName}</Link></span>
      </div>)}
    </section> : null}
    {deleteReasons.length ? <section className="grid gap-2 rounded-md border p-4"><h2 className="font-semibold">Удаление недоступно</h2><ul className="list-disc pl-5 text-sm text-stone-600">{deleteReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></section> : <div><ConfirmAction action={deleteCreatorAction} fields={[{name:"id",value:creator.id}]} title="Удалить создателя?" description={creator.relations.length || creator.incomingRelations.length ? "Связи псевдонима с другими создателями будут удалены. Продолжить?" : "Удаление доступно только если у создателя нет связей с записями, сериями и провайдерами."} confirmLabel="Удалить" triggerLabel="Удалить создателя" triggerVariant="destructive" /></div>}
  </div>;
}
