import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getClassificationInventory, getClassificationMigration, getClassificationSelectionLabels, listClassificationMigrations } from "@/db/queries/classification-migration";
import { classificationHash, publishedMembership, type RawRow } from "@/lib/classification-migration/model";
import { initialKeptSeriesIds } from "@/lib/classification-migration/selection";
import { ClassificationSeriesTree, ClassificationSelectionState, ClassificationApplyControls } from "./classification-series-tree";
import { approveMigrationAction, createPreviewAction, rollbackMigrationAction } from "./classification-migration-actions";

const PATH = "/admin/tools/jobs/migrations";

export async function ClassificationMigrationCard({ expanded, params }: {
  expanded: boolean;
  params: { id?: string; error?: string; queued?: string };
}) {
  await requireAdminUser();
  if (!expanded) return <article id="classification" className="space-y-2 rounded-md border bg-white p-5">
    <h4 className="font-semibold">Тематические серии → теги</h4>
    <p className="text-sm text-stone-600">Переносите серии в теги любыми партиями. В новом выборе видны только серии, которые ещё не переведены.</p>
    <Link className="text-sm underline" href={`${PATH}?classification=1#classification`}>Выбрать серии</Link>
  </article>;
  const validId = params.id && /^[0-9a-f-]{36}$/i.test(params.id) ? params.id : null;
  const [runs, selected, inventory] = await Promise.all([
    listClassificationMigrations(),
    validId ? getClassificationMigration(validId) : Promise.resolve(null),
    validId ? Promise.resolve(null) : getClassificationInventory(),
  ]);
  if (validId && !selected) return <article id="classification" className="rounded-md border bg-white p-5"><p>Сохранённый перенос не найден.</p><Link className="underline" href={`${PATH}?classification=1#classification`}>Открыть дерево серий</Link></article>;
  const state = selected?.beforeSnapshot ?? inventory!.state;
  const labels = await getClassificationSelectionLabels(state);
  const creatorNames = new Map(labels.creators.map(row => [row.id, row.name]));
  const mediaTitles = new Map(labels.media.map(row => [row.id, row.title]));
  const series = state.franchises.map(row => ({ id: Number(row.id), title: String(row.title), parentId: row.parent_id == null ? null : Number(row.parent_id) }));
  const seriesById = new Map(series.map(row => [row.id, row]));
  const tags = state.tags.map(row => ({ id: Number(row.id), title: String(row.title) }));
  const tagTitles = new Map(tags.map(row => [row.id, row.title]));
  const blockers = (selected?.preview.blockers ?? []) as string[];
  const statuses = { preview: "Предпросмотр", approved: "Подтверждён, ожидает выполнения", applied: "Перенесено", rolled_back: "Откат завершён" };
  const converted = selected?.manifest.series.filter(row => row.group === "tag") ?? [];
  const reparented = selected?.manifest.series.filter(row => row.group === "keep" &&
    row.parentId !== (seriesById.get(row.id)?.parentId ?? null)) ?? [];
  const selectionHash = selected ? classificationHash({ state, proof: selected.preview.evidence }) : inventory!.hash;
  return <ClassificationSelectionState key={selected?.id ?? "new"}><article id="classification" className="grid gap-6 rounded-md border bg-white p-5">
    <div><h4 className="font-semibold">Тематические серии → теги</h4><p className="mt-1 text-sm text-stone-600">Можно переносить по несколько серий за раз. Каждый новый выбор строится по текущему дереву без уже переведённых серий. Данные изменятся только после подтверждения переноса.</p></div>
    {params.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</p> : null}
    {params.queued ? <p role="status" className="text-sm text-stone-600">Задача поставлена в очередь. <Link className="underline" href="/admin/tools/jobs">Открыть задачи</Link></p> : null}
    <nav className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={`${PATH}?classification=1#classification`}>Новая партия</Link>{runs.map(run => <Link className="underline" key={run.id} href={`${PATH}?classificationId=${run.id}#classification`}>{run.createdAt.toLocaleString("ru-RU")} · {statuses[run.status]}</Link>)}</nav>
    {!selected || selected.status === "preview" ? <section className="grid gap-4">
      <h5 className="font-semibold">1. Оставить серии</h5>
      <form action={createPreviewAction}>
        <input type="hidden" name="selectionHash" value={selectionHash} />
        <ClassificationSeriesTree key={selected?.id ?? "new"} series={series} initialKeptIds={initialKeptSeriesIds(series, selected?.manifest)} initialManifest={selected?.manifest}
          creatorLinks={state.creator_series.map(row => ({ creatorId: Number(row.creator_id), seriesId: Number(row.series_id), name: creatorNames.get(Number(row.creator_id)) ?? "Удалённый создатель" }))}
          pendingLinks={state.media_item_franchises.filter(row => row.publication_status !== "published").map(row => ({ mediaItemId: Number(row.media_item_id), seriesId: Number(row.franchise_id), title: mediaTitles.get(Number(row.media_item_id)) ?? "Удалённая запись" }))}
          removalRequests={state.media_item_franchise_removal_requests.map(row => ({ mediaItemId: Number(row.media_item_id), seriesId: Number(row.franchise_id), title: mediaTitles.get(Number(row.media_item_id)) ?? "Удалённая запись" }))} />
      </form>
    </section> : null}
    {selected?.status === "applied" ? <div className="grid justify-items-start gap-2">
      <p className="text-sm text-stone-600">Эта партия перенесена. Можно выбрать следующие серии; уже переведённых в новом дереве не будет.</p>
      <Link className={buttonVariants()} href={`${PATH}?classification=1#classification`}>Выбрать следующую партию</Link>
    </div> : null}
    {selected ? <section className="grid gap-4 border-t border-stone-200 pt-5">
      <h5 className="font-semibold">2. Результат переноса</h5>
      <p className="text-sm">{statuses[selected.status]} · Станут тегами: {converted.length}</p>
      <div className="grid gap-4">
        <div><h6 className="mb-2 text-sm font-medium">Будут перенесены в теги</h6><ul className="grid gap-4 text-sm">{converted.map(row => {
          const seriesTitle = seriesById.get(row.id)?.title;
          const tagTitle = row.tagId === undefined ? seriesTitle : tagTitles.get(row.tagId);
          const achievements = state.achievements.filter(achievement => Number((achievement.params as RawRow).seriesId) === row.id);
          const genres = state.genres.filter(genre => Number(genre.replacement_franchise_id) === row.id);
          const creators = selected.manifest.creatorLinks.filter(link => link.seriesId === row.id);
          const pending = selected.manifest.pendingLinks.filter(link => link.franchiseId === row.id);
          const removals = selected.manifest.removalRequests.filter(link => link.franchiseId === row.id);
          return <li key={row.id} className="grid gap-1">
            <div><span className="font-medium">{seriesTitle}</span>{row.tagId !== undefined ? <> → тег «{tagTitle}»</> : " → новый тег"}</div>
            <div className="grid gap-1 pl-3 text-xs text-stone-600">
              <p>Записей в теме: {publishedMembership(state, row.id).length}. Назначения от редакции.</p>
              {achievements.length ? <p>Достижения перейдут на этот тег: {achievements.map(achievement => String(achievement.name)).join(", ")}. Выданные уровни сохранятся.</p> : null}
              {genres.length ? <p>У записей с публичным тегом «{tagTitle}» {genres.length === 1 ? "будет скрыт жанр" : "будут скрыты жанры"} {genres.map(genre => `«${genre.name}»`).join(", ")}.</p> : null}
              {creators.map(link => <p key={link.creatorId}>Создатель «{creatorNames.get(link.creatorId)}»: {link.targetSeriesId === null ? "убрать связь с этой серией" : `перенести связь в «${seriesById.get(link.targetSeriesId)?.title}»`}</p>)}
              {pending.length ? <p>Неопубликованных связей к удалению: {pending.length}.</p> : null}
              {removals.length ? <p>Запросов на удаление связей к закрытию: {removals.length}.</p> : null}
            </div>
          </li>;
        })}</ul></div>
        {reparented.length ? <div><h6 className="mb-2 text-sm font-medium">Останутся сериями с новым положением в дереве</h6><ul className="grid gap-2 text-sm">{reparented.map(row => <li key={row.id}><span className="font-medium">{seriesById.get(row.id)?.title}</span><span className="block text-xs text-stone-500">{row.parentId === null ? "Станет самостоятельной" : `Новый родитель: «${seriesById.get(row.parentId)?.title}»`}</span></li>)}</ul></div> : null}
      </div>
      {blockers.length ? <div role="alert"><p className="mb-2 font-medium text-red-800">Перенос пока недоступен</p><ul className="list-disc space-y-2 pl-5 text-sm text-red-800">{blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div> : <p className="text-sm text-stone-600">Состав записей для достижений сохраняется. Перед переносом система повторно проверит актуальность данных и прогресс пользователей.</p>}
      {selected.status === "preview" ? <form action={approveMigrationAction} className="grid max-w-xl gap-3">
        <input type="hidden" name="migrationId" value={selected.id} /><input type="hidden" name="previewHash" value={selected.previewHash} />
        <ClassificationApplyControls disabled={blockers.length > 0} />
      </form> : null}
      {selected.status === "applied" ? <form action={rollbackMigrationAction} className="grid max-w-xl gap-3">
        <input type="hidden" name="migrationId" value={selected.id} /><input type="hidden" name="previewHash" value={selected.previewHash} />
        <p className="text-sm text-stone-600">Откат восстановит исходные серии и связи. Выданные достижения сохранятся. При последующих изменениях данных автоматический откат будет остановлен.</p>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1 size-4 shrink-0 accent-stone-900" type="checkbox" name="confirmation" value="ОТКАТИТЬ ПЕРЕНОС" required />Подтверждаю откат переноса.</label>
        <Button type="submit" variant="destructive" className="w-fit">Откатить перенос</Button>
      </form> : null}
    </section> : null}
  </article></ClassificationSelectionState>;
}
