import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { getCreatorAvatarState } from "@/db/queries/creator-avatars";
import { CreatorAvatarEditor } from "../../creator-avatar-editor";
import { CreatorFantlabBindings } from "../../creator-fantlab-bindings";
import { creatorEditErrorMessage } from "@/lib/creators/editor";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminCreatorById, getCreatorTypes, getCreatorProviderBindings } from "@/db/queries/creators";
import { CreatorEditorHeader } from "../../creator-editor-header";
import { AdminToasts } from "../../../admin-toasts";
import { refreshCreatorImageAction } from "../../avatar-actions";
import { canWriteCreatorImage, creatorImageCandidates } from "@/lib/creators/image-policy";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { deleteCreatorAction } from "../../actions";
import { CreatorProviderVariants } from "../../provider-variants";
import { CreatorForm } from "../../creator-form";
import { Alert } from "@/components/ui/alert";
import { CreatorFieldsFillForm } from "../../../tools/providers/snapshots/creator-fields-fill-form";
import { CreatorFieldsFillRun, getCreatorFieldsFillRun } from "../../../tools/providers/snapshots/creator-fields-fill-run";

export default async function EditCreatorPage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{tab?:string;error?:string;updated?:string;avatarError?:string;avatarUpdated?:string;avatarQueued?:string;imageRun?:string;fantlabAuthor?:string;fillError?:string;fillRun?:string}>}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const creatorId = Number(id);
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) notFound();
  const bindingsTab = query.tab === "bindings";
  // Once a run is complete, read the creator after its saved changes.
  const fillRun = bindingsTab ? null : await getCreatorFieldsFillRun(query.fillRun, creatorId);
  const [creator, avatar, providerBindings, types] = await Promise.all([
    getAdminCreatorById(creatorId),
    bindingsTab ? null : getCreatorAvatarState(creatorId),
    getCreatorProviderBindings(creatorId, true),
    bindingsTab ? [] : getCreatorTypes(),
  ]);
  if (!creator) notFound();
  const activeBindings = providerBindings.filter(binding => binding.active);
  const imageBindings = creatorImageCandidates(creator.typeCode, activeBindings).flatMap(candidate => candidate.bindings);
  const deleteReasons = [
    ...(activeBindings.length ? ["Есть действующие привязки провайдеров."] : []),
    ...(creator.hasSourceEntries ? ["Создатель указан источником в записях."] : []),
    ...(creator.providerVariants.length ? ["Есть соответствия имён провайдеров."] : []),
    ...(creator.roles.length ? ["Есть участия в записях."] : []),
    ...(creator.hasPseudonymAssignments ? ["Создатель выбран отображаемым псевдонимом в записях."] : []),
  ];
  const deleteDescription = [
    ...(providerBindings.some(binding => !binding.active) ? ["Исторические привязки провайдеров будут удалены вместе с карточкой."] : []),
    ...(creator.relations.length || creator.incomingRelations.length ? ["Связи псевдонима с другими создателями будут удалены."] : []),
  ].join(" ") || "Карточка создателя будет удалена.";
  return <div className="grid gap-5">
    <CreatorEditorHeader id={creatorId} name={creator.name} active={bindingsTab ? "bindings" : "info"} />
    <AdminToasts clearParams={["error","updated"]} messages={query.error ? [{id:"error",tone:"error",text:creatorEditErrorMessage(query.error)}] : query.updated ? [{id:"updated",tone:"success",text:"Создатель сохранён."}] : []}/>
    <AdminToasts clearParams={["avatarError", "avatarUpdated", "avatarQueued", "imageRun", "fantlabAuthor"]} messages={query.avatarError ? [{id:"avatar-error",tone:"error",text:query.avatarError === "protected" ? "Изображение защищено: ручное изображение или изображение другой внешней идентичности нельзя заменить этой операцией." : query.avatarError === "binding" ? "Не удалось подтвердить привязку FantLab: проверьте ID и конфликты с другими создателями." : "Не удалось обновить аватар. Проверьте изображение и повторите попытку."}] : query.avatarQueued ? [{id:"avatar-queued",tone:"success",text:"Обновление аватара поставлено в очередь. Результат доступен в заданиях."}] : query.avatarUpdated ? [{id:"avatar-updated",tone:"success",text:query.fantlabAuthor ? `Подтверждён автор FantLab: ${query.fantlabAuthor}` : "Данные аватара сохранены."}] : []}/>
    {bindingsTab ? (
      <section className="grid gap-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Привязки к провайдерам</h2>
        <p className="text-sm text-stone-500">Привязка по ID подтверждает внешнюю идентичность. Соответствие имени хранится отдельно. Исторические привязки не используются для импорта и изображений.</p>
        <CreatorProviderVariants variants={creator.providerVariants} bindings={providerBindings}/>
        {creator.typeCode === "person" ? (
          <CreatorFantlabBindings creatorId={creatorId} hasActiveBinding={activeBindings.some(binding => binding.provider === "fantlab")} variants={creator.providerVariants}/>
        ) : null}
        <Link href="/admin/creator-requests" className="text-sm underline">Выбрать заявку провайдера</Link>
      </section>
    ) : <>
      <div><CreatorAvatarEditor creatorType={creator.typeCode} creatorId={creatorId} authorName={creator.name} avatarObjectKey={avatar?.avatarObjectKey ?? null}/><p className="mt-2 text-sm text-stone-500">Источник: {avatar?.avatarSource === "manual" ? "ручная аватарка" : avatar?.avatarSource ? COVER_PROVIDER_LABELS[avatar.avatarSource] : "нет изображения"}{avatar?.avatarSourceExternalId ? ` · ID провайдера ${avatar.avatarSourceExternalId}` : ""}{avatar?.avatarFetchedAt ? ` · Импорт: ${avatar.avatarFetchedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}` : ""}</p>{avatar?.avatarSourceUrl ? <a href={avatar.avatarSourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">Страница источника</a> : null}</div>
      <CreatorForm creator={creator} types={types} creators={creator.relations.map(relation => ({ id: relation.targetCreatorId, name: relation.name }))}/>
      <section className="grid gap-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Заполнение из источников</h2>
        {query.fillError === "invalid" && <Alert variant="destructive">Не удалось запустить заполнение из источников. Повторите попытку.</Alert>}
        {query.fillRun && !fillRun && <Alert variant="warning">Запуск заполнения для этого создателя не найден.</Alert>}
        <CreatorFieldsFillForm creatorId={creatorId} busy={fillRun?.status === "queued" || fillRun?.status === "running"} />
        {fillRun && <CreatorFieldsFillRun run={fillRun} single />}
      </section>
      {query.imageRun && /^\d+$/.test(query.imageRun) ? <Link className="text-sm underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${query.imageRun}`}>Открыть задачу обновления изображения №{query.imageRun}</Link> : null}
      <section className="grid gap-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Изображение из подтверждённого источника</h2>
        <p className="text-sm text-stone-500">Получает свежий профиль и изображение. Ручное изображение и изображение другого источника сохраняются.</p>
        {!imageBindings.length ? <p className="text-sm text-stone-500">Нет подтверждённого источника с поддержкой изображений. Проверьте вкладку «Привязки».</p> : null}
        {imageBindings.map(binding => <form key={binding.id} action={refreshCreatorImageAction}>
          <input type="hidden" name="creatorId" value={creatorId}/><input type="hidden" name="bindingId" value={binding.id}/>
          <Button variant="outline" disabled={Boolean(avatar && !canWriteCreatorImage(avatar, binding))}>Обновить из {COVER_PROVIDER_LABELS[binding.provider as keyof typeof COVER_PROVIDER_LABELS] ?? binding.provider} · {binding.externalCreatorId}</Button>
        </form>)}
        {avatar?.avatarObjectKey ? <p className="text-xs text-stone-500">Обновление доступно только из источника текущего изображения. Для смены источника сначала явно удалите изображение.</p> : null}
      </section>
      {creator.roles.length ? <p className="text-sm text-stone-600">Роли в записях: {creator.roles.map(role => role.name).join(", ")}. Роли назначаются у соответствующих записей.</p> : <p className="text-sm text-stone-500">Участий в записях пока нет. Роль назначается при добавлении создателя к записи.</p>}
      {deleteReasons.length ? <section className="grid gap-2 rounded-md border p-4"><h2 className="font-semibold">Удаление недоступно</h2><ul className="list-disc pl-5 text-sm text-stone-600">{deleteReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></section> : <div><ConfirmAction action={deleteCreatorAction} fields={[{name:"id",value:creator.id}]} title="Удалить создателя?" description={deleteDescription} confirmLabel="Удалить" triggerLabel="Удалить создателя" triggerVariant="destructive" /></div>}
    </>}
  </div>;
}
