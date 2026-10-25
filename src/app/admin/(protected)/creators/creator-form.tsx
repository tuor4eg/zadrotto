"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import { normalizeSearchText } from "@/lib/search/normalize";
import { creatorDateLabels } from "@/lib/creators/editor";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { findCreatorRelatedSeriesAction, saveCreatorAction, searchCreatorRelationsAction } from "./actions";

export function CreatorForm({ creator, types, series, creators }: {
  creator?: { id: number; name: string; nameRu?: string | null; nameRuSource?: string | null; nameRuProcessed?: boolean; originalName?: string | null; birthDate?: string | null; deathDate?: string | null; slug: string; typeId: number; seriesIds: number[]; relations: { targetCreatorId: number; relationType: "pseudonym_of"; name?: string }[]; incomingRelations: { sourceCreatorId: number; name: string; relationType: "pseudonym_of" }[] };
  types: { id: number; name: string; code: string }[];
  series: SearchableFranchiseOption[];
  creators: { id: number; name: string }[];
}) {
  const [nameRu, setNameRu] = useState(creator?.nameRu ?? "");
  const [nameRuEdited, setNameRuEdited] = useState(false);
  const [initialBirthDate] = useState(creator?.birthDate ?? "");
  const [initialDeathDate] = useState(creator?.deathDate ?? "");
  const [birthDate, setBirthDate] = useState(initialBirthDate);
  const [deathDate, setDeathDate] = useState(initialDeathDate);
  const [relatedIds, setRelatedIds] = useState(() => creator?.relations.map(relation => relation.targetCreatorId) ?? []);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [typeId, setTypeId] = useState(creator?.typeId ?? types.find(type => type.code === "person")?.id);
  const typeCode = types.find(type => type.id === typeId)?.code ?? "person";
  const dateLabels = creatorDateLabels(typeCode);
  const datesEnabled = typeCode === "organization" || (typeCode === "person" && relatedIds.length === 0);
  const [knownCreators, setKnownCreators] = useState(creators);
  const [relatedOptions, setRelatedOptions] = useState<{ id: number; name: string }[]>([]);
  const [searchState, setSearchState] = useState("Введите не менее 3 символов для поиска.");
  useEffect(() => {
    let cancelled = false;
    if (normalizeSearchText(creatorSearch).length < 3 || typeCode === "organization") return;
    const timer = setTimeout(() => {
      setSearchState("Поиск…");
      searchCreatorRelationsAction(creatorSearch, creator?.id).then(result => {
        if (cancelled) return;
        setRelatedOptions(result.items);
        setKnownCreators(previous => [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()]);
        setSearchState(result.hasMore ? "Показаны первые 20. Уточните имя." : result.items.length ? "" : "Создатели не найдены.");
      }).catch(() => { if (!cancelled) setSearchState("Не удалось выполнить поиск. Измените запрос и повторите."); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [creatorSearch, creator?.id, typeCode]);
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
    <input type="hidden" name="relationType" value="pseudonym_of" />
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor="creator-name">{typeCode === "organization" ? "Название" : "Имя"}</Label><Input id="creator-name" name="name" defaultValue={creator?.name} required maxLength={200} /></div>
      <div className="grid gap-2"><Label htmlFor="creator-original-name">{typeCode === "organization" ? "Оригинальное название" : "Оригинальное имя"}</Label><Input id="creator-original-name" name="originalName" defaultValue={creator?.originalName ?? ""} maxLength={200} /></div>
      <div className="grid gap-2"><Label htmlFor="creator-slug">Slug</Label><Input id="creator-slug" name="slug" defaultValue={creator?.slug} required maxLength={200} /><p className="text-xs text-stone-500">Латинские буквы, цифры и дефисы. Используется в ссылке архива.</p></div>
      <div className="grid content-start gap-2"><Label htmlFor="creator-type">Тип</Label><Select id="creator-type" name="typeId" required value={typeId} onChange={event => { setTypeId(Number(event.target.value)); setCreatorSearch(""); setRelatedOptions([]); setSearchState("Введите не менее 3 символов для поиска."); }}>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></div>
    </div>
    {typeCode === "person" ? <div className="grid gap-2"><Label htmlFor="creator-name-ru">Русское имя</Label><Input id="creator-name-ru" name={nameRuEdited ? "nameRu" : undefined} value={nameRu} onChange={event => { setNameRu(event.target.value); setNameRuEdited(true); }} maxLength={200} /><p className="text-xs text-stone-500">Источник: {creator?.nameRuSource === "manual" ? "вручную" : creator?.nameRuSource === "provider" ? "провайдер" : creator?.nameRuSource === "ai" ? "ИИ" : "не задан"}. Локализация: {creator?.nameRuProcessed ? "обработано" : "ожидает обработки"}. Изменение или очищение поля сохраняется как ручное решение.</p></div> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor="creator-birth-date">{dateLabels.start}</Label><Input id="creator-birth-date" name={!creator || birthDate !== initialBirthDate ? "birthDate" : undefined} type="date" disabled={!datesEnabled} value={birthDate} onChange={event => setBirthDate(event.target.value)} /></div>
      <div className="grid gap-2"><Label htmlFor="creator-death-date">{dateLabels.end}</Label><Input id="creator-death-date" name={!creator || deathDate !== initialDeathDate ? "deathDate" : undefined} type="date" disabled={!datesEnabled} value={deathDate} onChange={event => setDeathDate(event.target.value)} /></div>
      <p className="text-xs text-stone-500 sm:col-span-2">{typeCode === "organization" ? "Полные календарные даты создания и закрытия организации. Автоматически из профилей не заполняются." : datesEnabled ? "Полные даты жизни. Заполненные даты сохраняются при обработке снимков; очищенная дата может заполниться снова." : "Даты жизни недоступны для этого типа или при исходящей связи псевдонима. Для удаления существующих дат сначала уберите связь псевдонима."}</p>
    </div>
    <div className="grid gap-2"><Label htmlFor="creator-series">Прямые связи с сериями</Label>
      <div className="flex flex-col items-start gap-2 sm:flex-row">
        <div className="w-full min-w-0 flex-1"><SearchableFranchiseMultiSelect id="creator-series" name="seriesIds" options={series} value={seriesIds} onChange={setSeriesIds} /></div>
        {creator ? <Button type="button" variant="outline" className="shrink-0" disabled={isFindingSeries} onClick={findRelatedSeries}>{isFindingSeries ? "Ищем серии…" : "Найти связанные серии"}</Button> : null}
      </div>
      <p className="text-xs text-stone-500">Выберите серии через поиск. Они появятся ссылками в архиве создателя.</p>
    </div>
    {typeCode !== "organization" || relatedIds.length > 0 || creator?.incomingRelations.length ? <section className="grid gap-3" aria-labelledby="creator-relations-heading">
      <h2 id="creator-relations-heading" className="font-semibold">Псевдоним</h2>
      <p className="text-sm text-stone-500">Этот создатель — псевдоним выбранных ниже людей или коллективов. Связь направлена от псевдонима к участникам. Выбор отображаемого псевдонима у записи применяется к роли «Писатель».</p>
      {relatedIds.map(relatedId => <input key={relatedId} type="hidden" name="relatedCreatorIds" value={relatedId} />)}
      <div className="flex flex-wrap gap-2">{relatedIds.map(relatedId => <Button key={relatedId} type="button" variant="outline" size="sm" aria-label={`Убрать ${knownCreators.find(option => option.id === relatedId)?.name ?? relatedId}`} onClick={() => setRelatedIds(selected => selected.filter(id => id !== relatedId))}>{knownCreators.find(option => option.id === relatedId)?.name ?? relatedId} ×</Button>)}</div>
      <Label htmlFor="related-creator-search">Найти участника псевдонима</Label>
      <Input id="related-creator-search" type="search" disabled={typeCode === "organization"} maxLength={200} value={creatorSearch} onChange={event => { setCreatorSearch(event.target.value); setRelatedOptions([]); setSearchState(normalizeSearchText(event.target.value).length < 3 ? "Введите не менее 3 символов для поиска." : "Поиск…"); }} placeholder="Поиск по имени" />
      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3">{relatedOptions.length ? relatedOptions.map(option => <label key={option.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={relatedIds.includes(option.id)} onChange={event => setRelatedIds(selected => event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />{option.name}</label>) : null}{searchState ? <p role="status" className="text-sm text-stone-500">{searchState}</p> : null}</div>
      {creator?.incomingRelations.length ? <div className="grid gap-1 text-sm"><p className="font-medium">Псевдонимы этого создателя</p>{creator.incomingRelations.map(relation => <Link key={relation.sourceCreatorId} href={`/admin/creators/${relation.sourceCreatorId}/edit`} className="underline">{relation.name}</Link>)}</div> : null}
    </section> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={isFindingSeries}>{creator ? "Сохранить изменения" : "Создать создателя"}</Button>{creator ? <Link href={`/archive?creator=${encodeURIComponent(creator.slug)}`} className={buttonVariants({ variant: "outline" })}>Посмотреть на сайте</Link> : null}<Link href="/admin/creators" className={buttonVariants({ variant: "outline" })}>Отмена</Link></div>
  </form>;
}
