"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Input, Label } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { normalizeSearchText } from "@/lib/search/normalize";
import { resolveCreatorAction } from "../creators/actions";

function SubmitDecision({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || disabled}>{pending ? "Сохранение…" : "Применить решение"}</Button>;
}

export function CreatorDecisionForm({ requestId, name, people, provider, externalCreatorId }: { requestId: number; name: string; people: { id: number; name: string; bindings?: { provider: string; externalCreatorId: string }[] }[]; provider?: string; externalCreatorId?: string | null }) {
  const isOrganization = provider === "igdb" || provider === "rawg" || (provider === "tmdb" && externalCreatorId?.startsWith("company:"));
  const [decision, setDecision] = useState("map");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const normalizedSearch = normalizeSearchText(search);
  const matchingPeople = people.filter(person => normalizeSearchText(person.name).includes(normalizedSearch));
  const totalPages = Math.max(1, Math.ceil(matchingPeople.length / 12));
  const currentPage = Math.min(page, totalPages);
  const visiblePeople = matchingPeople.slice((currentPage - 1) * 12, currentPage * 12);
  const selected = people.find(person => person.id === selectedId);

  return <form action={resolveCreatorAction} className="grid gap-5">
    <input type="hidden" name="requestId" value={requestId} />
    <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-medium">Решение</legend>
      {[["map", "Связать с существующим создателем"], ["create", "Создать нового создателя"], ["exclude", "Игнорировать значение"]].map(([value, label]) => <label key={value} className="flex items-start gap-2 text-sm">
        <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-0.5" />{label}
      </label>)}
    </fieldset>
    {decision === "create" ? <div className="grid gap-2"><Label htmlFor="new-creator-name">{isOrganization ? "Название" : "Имя"}</Label><Input id="new-creator-name" name="name" defaultValue={name} required maxLength={200} />{isOrganization ? <><input type="hidden" name="typeCode" value="organization" /><p className="text-xs leading-5 text-stone-500">Будет создана организация. Роли определяются связями с записями.</p></> : provider === "bgg" ? <><Label htmlFor="new-creator-type">Тип создателя</Label><select id="new-creator-type" name="typeCode" defaultValue="person" className="rounded-md border px-3 py-2"><option value="person">Человек</option><option value="collective">Коллектив</option></select><p className="text-xs leading-5 text-stone-500">Создатель получит роли из связанных настолок. Тип существующего создателя при привязке не меняется.</p></> : <p className="text-xs leading-5 text-stone-500">{provider === "tmdb" ? "Будет создан человек с ролью «Режиссёр» в связанных фильмах." : "Будет создан человек с ролью «Писатель» в связанных книгах."}</p>}</div> : null}
    {decision === "map" ? <fieldset><legend className="mb-3 text-sm font-medium">Наши создатели</legend>
      <input type="hidden" name="creatorId" value={selectedId ?? ""} />
      {people.length ? <div className="grid gap-4">
        <div>
          <p className="mb-2 text-xs text-stone-500">Выбрано: {selected ? 1 : 0}</p>
          {selected ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedId(null)} aria-label={`Убрать создателя ${selected.name}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-sm hover:bg-stone-200">
            <span className="break-words">{selected.name}</span><X aria-hidden="true" className="size-3.5 shrink-0" />
          </button></div> : <p className="text-sm text-stone-500">Создатель пока не выбран.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="creator-search">Найти создателя</Label>
          <Input id="creator-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Имя создателя" />
        </div>
        <p className="text-xs text-stone-500">Найдено: {matchingPeople.length}</p>
        {visiblePeople.length ? <div className="grid gap-2 sm:grid-cols-2">{visiblePeople.map(person => <label key={person.id} className="flex min-w-0 items-start gap-2 text-sm">
          <input type="radio" name="creator-choice" value={person.id} checked={selectedId === person.id} onChange={() => setSelectedId(person.id)} className="mt-0.5" /><span className="break-words">{person.name}{person.bindings?.length ? <span className="mt-1 block text-xs text-stone-500">{person.bindings.map(binding => `${binding.provider} · ${binding.externalCreatorId}`).join("; ")}</span> : null}</span>
        </label>)}</div> : <p className="text-sm text-stone-500">Создатели не найдены.</p>}
        {totalPages > 1 ? <nav aria-label="Страницы выбора создателей" className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button>
          <span className="text-sm text-stone-500">{currentPage} / {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Далее</Button>
        </nav> : null}
      </div> : <p className="text-sm text-stone-500">Нет создателей. Можно создать нового.</p>}
      <p className="mt-3 text-xs text-stone-500">Выберите одного создателя для этого значения провайдера.</p>
    </fieldset> : null}
    {decision === "exclude" ? <p className="text-sm leading-6 text-stone-600">Значение останется в исходных данных провайдера, но не будет создавать связи и новые заявки.</p> : null}
    <p className="text-xs leading-5 text-stone-500">Решение применяется к существующим записям в фоне. После сохранения изменить решение в этой форме нельзя.</p>
    <div><SubmitDecision disabled={decision === "map" && !selectedId} /></div>
  </form>;
}
