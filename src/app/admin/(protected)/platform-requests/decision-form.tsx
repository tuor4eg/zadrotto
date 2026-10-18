"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { MediaItemPlatform } from "@/lib/media/platforms";
import { normalizeSearchText } from "@/lib/search/normalize";

function SubmitDecision() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : "Сохранить решение"}</Button>;
}

export function PlatformRequestDecisionForm({ requestId, platforms, action }: {
  requestId: number; platforms: readonly MediaItemPlatform[]; action: (formData: FormData) => Promise<void>;
}) {
  const [decision, setDecision] = useState("map");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const normalizedSearch = normalizeSearchText(search);
  const matchingPlatforms = platforms.filter((platform) => normalizeSearchText(platform.name).includes(normalizedSearch));
  const totalPages = Math.max(1, Math.ceil(matchingPlatforms.length / 12));
  const currentPage = Math.min(page, totalPages);
  const visiblePlatforms = matchingPlatforms.slice((currentPage - 1) * 12, currentPage * 12);
  const selectedPlatforms = platforms.filter((platform) => selectedIds.includes(platform.id));
  function togglePlatform(id: number) {
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  }
  return <form action={action} className="grid gap-5">
    <input type="hidden" name="requestId" value={requestId} />
    <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-medium">Решение</legend>
      {[
        ["map", "Связать с существующими платформами"], ["create", "Создать нашу платформу"], ["exclude", "Не считать платформой"],
      ].map(([value, label]) => <label key={value} className="flex items-start gap-2 text-sm">
        <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-0.5" />{label}
      </label>)}
    </fieldset>
    {decision === "create" ? <div className="grid gap-2">
      <Label htmlFor="new-platform-name">Название</Label><Input id="new-platform-name" name="name" required aria-describedby="new-platform-hint" />
      <p id="new-platform-hint" className="text-xs leading-5 text-stone-500">Название используется во всех карточках записей с этой платформой.</p>
    </div> : null}
    {decision === "map" ? <fieldset><legend className="mb-3 text-sm font-medium">Наши платформы</legend>
      {selectedIds.map((id) => <input key={id} type="hidden" name="platformIds" value={id} />)}
      {platforms.length ? <div className="grid gap-4">
        <div>
          <p className="mb-2 text-xs text-stone-500">Выбрано: {selectedPlatforms.length}</p>
          {selectedPlatforms.length ? <div className="flex flex-wrap gap-2">{selectedPlatforms.map((platform) =>
            <button key={platform.id} type="button" onClick={() => togglePlatform(platform.id)} aria-label={`Убрать платформу ${platform.name}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-sm hover:bg-stone-200">
              <span className="break-words">{platform.name}</span><X aria-hidden="true" className="size-3.5 shrink-0" />
            </button>)}</div> : <p className="text-sm text-stone-500">Платформы пока не выбраны.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="platform-search">Поиск платформ</Label>
          <Input id="platform-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Название платформы" />
        </div>
        <p className="text-xs text-stone-500">Найдено: {matchingPlatforms.length}</p>
        {visiblePlatforms.length ? <div className="grid gap-2 sm:grid-cols-2">{visiblePlatforms.map((platform) => <label key={platform.id} className="flex min-w-0 items-start gap-2 text-sm">
          <input type="checkbox" checked={selectedIds.includes(platform.id)} onChange={() => togglePlatform(platform.id)} className="mt-0.5" /><span className="break-words">{platform.name}</span>
        </label>)}</div> : <p className="text-sm text-stone-500">Платформы не найдены.</p>}
        {totalPages > 1 ? <nav aria-label="Страницы выбора платформ" className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button>
          <span className="text-sm text-stone-500">{currentPage} / {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Далее</Button>
        </nav> : null}
      </div> : <p className="text-sm text-stone-500">Нет активных платформ. Можно создать новую.</p>}
      <p className="mt-3 text-xs text-stone-500">Можно выбрать несколько платформ.</p>
    </fieldset> : null}
    {decision === "exclude" ? <p className="text-sm leading-6 text-stone-600">Значение останется в исходных данных провайдера, но не будет отображаться как платформа и создавать новые заявки.</p> : null}
    <p className="text-xs leading-5 text-stone-500">Решение применяется к существующим записям в фоне. После сохранения изменить решение в этой форме нельзя.</p>
    <div><SubmitDecision /></div>
  </form>;
}
