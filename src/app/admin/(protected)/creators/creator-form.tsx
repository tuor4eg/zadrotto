"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import { normalizeSearchText } from "@/lib/search/normalize";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { findCreatorRelatedSeriesAction, saveCreatorAction } from "./actions";

export function CreatorForm({ creator, types, series, creators }: {
  creator?: { id: number; name: string; originalName?: string | null; slug: string; typeId: number; seriesIds: number[]; relations: { targetCreatorId: number; relationType: "pseudonym_of" }[]; incomingRelations: { sourceCreatorId: number; name: string; relationType: "pseudonym_of" }[] };
  types: { id: number; name: string; code: string }[];
  series: SearchableFranchiseOption[];
  creators: { id: number; name: string }[];
}) {
  const [relatedIds, setRelatedIds] = useState(() => creator?.relations.map(relation => relation.targetCreatorId) ?? []);
  const [creatorSearch, setCreatorSearch] = useState("");
  const normalizedSearch = normalizeSearchText(creatorSearch);
  const relatedOptions = creators.filter(option => option.id !== creator?.id && normalizeSearchText(option.name).includes(normalizedSearch));
  const [seriesIds, setSeriesIds] = useState(() => creator?.seriesIds.map(String) ?? []);
  const [isFindingSeries, startFindingSeries] = useTransition();
  const [toast, setToast] = useState<AdminToast | null>(null);

  function findRelatedSeries() {
    if (!creator) return;
    setToast(null);
    startFindingSeries(async () => {
      try {
        const relatedIds = await findCreatorRelatedSeriesAction(creator.id);
        const availableIds = new Set(series.map(item => String(item.id)));
        const foundIds = relatedIds.map(String).filter(id => availableIds.has(id));
        setSeriesIds(selected => [...new Set([...selected, ...foundIds])]);
        setToast({ id: `series-found-${Date.now()}`, tone: "success", text: foundIds.length
          ? `Найдено серий: ${foundIds.length}. Проверьте выбор и сохраните изменения.`
          : "Связанные серии не найдены." });
      } catch {
        setToast({ id: `series-error-${Date.now()}`, tone: "error", text: "Не удалось найти связанные серии. Попробуйте ещё раз." });
      }
    });
  }
  return <form action={saveCreatorAction} className="grid max-w-3xl gap-5 rounded-lg border border-stone-200 bg-white p-5 sm:p-6">
    {toast ? <AdminToasts messages={[toast]} /> : null}
    {creator ? <input type="hidden" name="id" value={creator.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor="creator-name">Имя</Label><Input id="creator-name" name="name" defaultValue={creator?.name} required maxLength={200} /></div>
      <div className="grid gap-2"><Label htmlFor="creator-original-name">Оригинальное имя</Label><Input id="creator-original-name" name="originalName" defaultValue={creator?.originalName ?? ""} maxLength={200} /></div>
      <div className="grid gap-2"><Label htmlFor="creator-slug">Slug</Label><Input id="creator-slug" name="slug" defaultValue={creator?.slug} required maxLength={200} /><p className="text-xs text-stone-500">Латинские буквы, цифры и дефисы. Используется в ссылке архива.</p></div>
      <div className="grid content-start gap-2"><Label htmlFor="creator-type">Тип</Label><Select id="creator-type" name="typeId" required defaultValue={creator?.typeId ?? types.find(type => type.code === "person")?.id}>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></div>
    </div>
    <div className="grid gap-2"><Label htmlFor="creator-series">Прямые связи с сериями</Label>
      <div className="flex flex-col items-start gap-2 sm:flex-row">
        <div className="w-full min-w-0 flex-1"><SearchableFranchiseMultiSelect id="creator-series" name="seriesIds" options={series} value={seriesIds} onChange={setSeriesIds} /></div>
        {creator ? <Button type="button" variant="outline" className="shrink-0" disabled={isFindingSeries} onClick={findRelatedSeries}>{isFindingSeries ? "Ищем серии…" : "Найти связанные серии"}</Button> : null}
      </div>
      <p className="text-xs text-stone-500">Выберите серии через поиск. Они появятся ссылками в архиве создателя.</p>
    </div>
    <section className="grid gap-3" aria-labelledby="creator-relations-heading">
      <h2 id="creator-relations-heading" className="font-semibold">Связанные Creator</h2>
      <p className="text-sm text-stone-500">Этот Creator — псевдоним выбранных ниже авторов. Связь направлена от псевдонима к реальным авторам.</p>
      <div className="grid gap-2"><Label htmlFor="creator-relation-type">Тип связи</Label><Select id="creator-relation-type" name="relationType" defaultValue="pseudonym_of"><option value="pseudonym_of">Псевдоним авторов (pseudonym_of)</option></Select></div>
      {relatedIds.map(relatedId => <input key={relatedId} type="hidden" name="relatedCreatorIds" value={relatedId} />)}
      <div className="flex flex-wrap gap-2">{relatedIds.map(relatedId => <Button key={relatedId} type="button" variant="outline" size="sm" aria-label={`Убрать ${creators.find(option => option.id === relatedId)?.name ?? relatedId}`} onClick={() => setRelatedIds(selected => selected.filter(id => id !== relatedId))}>{creators.find(option => option.id === relatedId)?.name ?? relatedId} ×</Button>)}</div>
      <Label htmlFor="related-creator-search">Найти Creator</Label>
      <Input id="related-creator-search" type="search" value={creatorSearch} onChange={event => setCreatorSearch(event.target.value)} placeholder="Поиск по имени" />
      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3">{relatedOptions.length ? relatedOptions.map(option => <label key={option.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={relatedIds.includes(option.id)} onChange={event => setRelatedIds(selected => event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />{option.name}</label>) : <p className="text-sm text-stone-500">Создатели не найдены.</p>}</div>
      {creator?.incomingRelations.length ? <div className="grid gap-1 text-sm"><p className="font-medium">Псевдонимы этого Creator</p>{creator.incomingRelations.map(relation => <Link key={relation.sourceCreatorId} href={`/admin/creators/${relation.sourceCreatorId}/edit`} className="underline">{relation.name}</Link>)}</div> : null}
    </section>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={isFindingSeries}>{creator ? "Сохранить изменения" : "Создать создателя"}</Button>{creator ? <Link href={`/archive?creator=${encodeURIComponent(creator.slug)}`} className={buttonVariants({ variant: "outline" })}>Посмотреть на сайте</Link> : null}<Link href="/admin/creators" className={buttonVariants({ variant: "outline" })}>Отмена</Link></div>
  </form>;
}
