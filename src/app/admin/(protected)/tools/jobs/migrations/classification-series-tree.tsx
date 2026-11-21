"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/form";
import { classificationSearchVisibility, classificationTree, retainedParentId, type ClassificationSeriesOption, type ClassificationTreeNode } from "@/lib/classification-migration/selection";
import type { ClassificationManifest } from "@/lib/classification-migration/model";

const SelectionContext = createContext({ dirty: false, markDirty: () => {} });

export function ClassificationSelectionState({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <SelectionContext.Provider value={{ dirty, markDirty: () => setDirty(true) }}>{children}</SelectionContext.Provider>;
}

export function ClassificationApplyControls({ disabled }: { disabled: boolean }) {
  const { dirty } = useContext(SelectionContext);
  const { pending } = useFormStatus();
  return <>
    {dirty ? <p role="status" className="text-sm text-amber-800">Вы изменили выбор. Нажмите «Посмотреть результат», чтобы обновить предпросмотр.</p> : null}
    <label className="flex items-start gap-2 text-sm"><input className="mt-1 size-4 shrink-0 accent-stone-900" type="checkbox" name="confirmation" value="ПЕРЕНЕСТИ ТЕМЫ" required disabled={disabled || dirty || pending} />Я проверил результат и подтверждаю перенос.</label>
    <Button type="submit" disabled={disabled || dirty || pending} className="w-fit">{pending ? "Запускаем перенос…" : "Подтвердить перенос в теги"}</Button>
  </>;
}

export type ClassificationTreeProps = {
  series: ClassificationSeriesOption[];
  initialKeptIds: number[];
  initialManifest?: ClassificationManifest;
  creatorLinks: { creatorId: number; seriesId: number; name: string }[];
  pendingLinks: { mediaItemId: number; seriesId: number; title: string }[];
  removalRequests: { mediaItemId: number; seriesId: number; title: string }[];
};

function PreviewButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" className="w-fit" disabled={disabled || pending}>{pending ? "Проверяем изменения…" : "Посмотреть результат"}</Button>;
}

export function ClassificationSeriesTree({ series, initialKeptIds, initialManifest, creatorLinks, pendingLinks, removalRequests }: ClassificationTreeProps) {
  const { markDirty } = useContext(SelectionContext);
  const [search, setSearch] = useState("");
  const [kept, setKept] = useState(() => new Set(initialKeptIds));
  const tree = useMemo(() => classificationTree(series), [series]);
  const visibleIds = useMemo(() => classificationSearchVisibility(tree, search), [tree, search]);
  const parents = useMemo(() => new Map(series.map(row => [row.id, row.parentId])), [series]);
  const byId = useMemo(() => new Map(series.map(row => [row.id, row])), [series]);
  const keptOptions = series.filter(row => kept.has(row.id));
  const affectedCreators = creatorLinks.filter(row => !kept.has(row.seriesId));
  const pending = pendingLinks.filter(row => !kept.has(row.seriesId));
  const removals = removalRequests.filter(row => !kept.has(row.seriesId));
  function renderNode(node: ClassificationTreeNode) {
    const isKept = kept.has(node.id);
    let parentTitle = "В корне каталога";
    if (isKept) {
      try { const id = retainedParentId(parents, node.id, kept); if (id !== null) parentTitle = `Внутри «${byId.get(id)?.title}»`; }
      catch { parentTitle = "Нужно исправить вложенность"; }
    }
    return <li key={node.id} hidden={!visibleIds.has(node.id)}>
      <div className="grid gap-2 rounded-md px-2 py-2 hover:bg-stone-50">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input className="mt-0.5 size-4 shrink-0 accent-stone-900" type="checkbox" name="keepSeriesId" value={node.id} checked={isKept}
            onChange={event => setKept(current => { const next = new Set(current); if (event.target.checked) next.add(node.id); else next.delete(node.id); return next; })} />
          <span className="min-w-0"><span className="break-words font-medium">{node.title}</span><span className={`ml-2 text-xs ${isKept ? "text-stone-500" : "font-medium text-amber-800"}`}>{isKept ? "Оставить" : "→ в теги"}</span><span className="mt-0.5 block text-xs text-stone-500">{isKept ? parentTitle : "Записи получат этот тег от редакции"}</span></span>
        </label>

      </div>
      {node.children.length ? <ul className="ml-3 border-l border-stone-200 pl-3 sm:ml-4 sm:pl-4">{node.children.map(renderNode)}</ul> : null}
    </li>;
  }
  return <div className="grid gap-4" onChange={markDirty}>
    <p className="text-sm text-stone-600">Оставьте галки у серий. Серии без галок станут тегами. Дочерние узлы выбираются отдельно; вложенность оставленных серий сохранится.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" onClick={() => { setKept(new Set(series.map(row => row.id))); markDirty(); }}>Оставить все</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => { setKept(new Set()); markDirty(); }}>Снять все галки</Button>
      <span role="status" className="text-sm text-stone-600">Останутся: {kept.size} · В теги: {series.length - kept.size}</span>
    </div>
    <SearchInput containerClassName="sm:max-w-md" aria-label="Поиск серий для переноса" placeholder="Название серии" value={search}
      onChange={event => { event.stopPropagation(); setSearch(event.target.value); }}
      onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
    {tree.length > 0 && visibleIds.size === 0 ? <p className="text-sm text-stone-500">Серии не найдены.</p> : null}
    {tree.length ? <ul className="max-h-[36rem] overflow-auto rounded-md border border-stone-200 p-2" aria-label="Оставить серией">{tree.map(renderNode)}</ul> : <p className="text-sm text-stone-500">Серий для переноса нет.</p>}
    {affectedCreators.length || pending.length || removals.length ? <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <h5 className="font-medium">Связи, для которых нужно решение</h5>
      {affectedCreators.map(row => <label className="grid gap-1 text-sm" key={`${row.creatorId}:${row.seriesId}`}>Создатель «{row.name}» связан с «{byId.get(row.seriesId)?.title}»
        <Select required name={`creatorTarget:${row.creatorId}:${row.seriesId}`} defaultValue={(() => { const old = initialManifest?.creatorLinks.find(link => link.creatorId === row.creatorId && link.seriesId === row.seriesId); return old ? old.targetSeriesId ?? "remove" : ""; })()}>
          <option value="" disabled>Выберите действие</option><option value="remove">Убрать связь с этой тематикой</option>
          {keptOptions.map(option => <option key={option.id} value={option.id}>Связать с «{option.title}»</option>)}
        </Select>
      </label>)}
      {pending.map(row => <label className="flex items-start gap-2 text-sm" key={`pending:${row.mediaItemId}:${row.seriesId}`}><input type="checkbox" className="mt-1 size-4 shrink-0 accent-stone-900" required name={`pending:${row.mediaItemId}:${row.seriesId}`} value="discard" defaultChecked={initialManifest?.pendingLinks.some(link => link.mediaItemId === row.mediaItemId && link.franchiseId === row.seriesId)} />Убрать неопубликованную связь: «{row.title}» → «{byId.get(row.seriesId)?.title}»</label>)}
      {removals.map(row => <label className="flex items-start gap-2 text-sm" key={`removal:${row.mediaItemId}:${row.seriesId}`}><input type="checkbox" className="mt-1 size-4 shrink-0 accent-stone-900" required name={`removal:${row.mediaItemId}:${row.seriesId}`} value="discard" defaultChecked={initialManifest?.removalRequests.some(link => link.mediaItemId === row.mediaItemId && link.franchiseId === row.seriesId)} />Закрыть запрос на удаление связи: «{row.title}» → «{byId.get(row.seriesId)?.title}»</label>)}
    </section> : null}
    <PreviewButton disabled={kept.size === series.length} />
  </div>;
}
