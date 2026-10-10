"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { MediaItemGenre } from "@/lib/media/genres";
import { normalizeSearchText } from "@/lib/search/normalize";

function SubmitDecision() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : "Сохранить решение"}</Button>;
}

export function GenreRequestDecisionForm({ requestId, genres, action }: {
  requestId: number; genres: readonly MediaItemGenre[]; action: (formData: FormData) => Promise<void>;
}) {
  const [decision, setDecision] = useState("map");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const normalizedSearch = normalizeSearchText(search);
  const matchingGenres = genres.filter((genre) => normalizeSearchText(genre.name).includes(normalizedSearch));
  const totalPages = Math.max(1, Math.ceil(matchingGenres.length / 12));
  const currentPage = Math.min(page, totalPages);
  const visibleGenres = matchingGenres.slice((currentPage - 1) * 12, currentPage * 12);
  const selectedGenres = genres.filter((genre) => selectedIds.includes(genre.id));
  function toggleGenre(id: number) {
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  }
  return <form action={action} className="grid gap-5">
    <input type="hidden" name="requestId" value={requestId} />
    <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-medium">Решение</legend>
      {[
        ["map", "Связать с существующими жанрами"], ["create", "Создать наш жанр"], ["exclude", "Не считать жанром"],
      ].map(([value, label]) => <label key={value} className="flex items-start gap-2 text-sm">
        <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-0.5" />{label}
      </label>)}
    </fieldset>
    {decision === "create" ? <div className="grid gap-2">
      <Label htmlFor="new-genre-name">Название</Label><Input id="new-genre-name" name="name" required aria-describedby="new-genre-hint" />
      <p id="new-genre-hint" className="text-xs leading-5 text-stone-500">Название используется во всех карточках записей с этим жанром.</p>
    </div> : null}
    {decision === "map" ? <fieldset><legend className="mb-3 text-sm font-medium">Наши жанры</legend>
      {selectedIds.map((id) => <input key={id} type="hidden" name="genreIds" value={id} />)}
      {genres.length ? <div className="grid gap-4">
        <div>
          <p className="mb-2 text-xs text-stone-500">Выбрано: {selectedGenres.length}</p>
          {selectedGenres.length ? <div className="flex flex-wrap gap-2">{selectedGenres.map((genre) =>
            <button key={genre.id} type="button" onClick={() => toggleGenre(genre.id)} aria-label={`Убрать жанр ${genre.name}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-sm hover:bg-stone-200">
              <span className="break-words">{genre.name}</span><X aria-hidden="true" className="size-3.5 shrink-0" />
            </button>)}</div> : <p className="text-sm text-stone-500">Жанры пока не выбраны.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="genre-search">Поиск жанров</Label>
          <Input id="genre-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Название жанра" />
        </div>
        <p className="text-xs text-stone-500">Найдено: {matchingGenres.length}</p>
        {visibleGenres.length ? <div className="grid gap-2 sm:grid-cols-2">{visibleGenres.map((genre) => <label key={genre.id} className="flex min-w-0 items-start gap-2 text-sm">
          <input type="checkbox" checked={selectedIds.includes(genre.id)} onChange={() => toggleGenre(genre.id)} className="mt-0.5" /><span className="break-words">{genre.name}</span>
        </label>)}</div> : <p className="text-sm text-stone-500">Жанры не найдены.</p>}
        {totalPages > 1 ? <nav aria-label="Страницы выбора жанров" className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</Button>
          <span className="text-sm text-stone-500">{currentPage} / {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Далее</Button>
        </nav> : null}
      </div> : <p className="text-sm text-stone-500">Нет активных жанров. Можно создать новый.</p>}
      <p className="mt-3 text-xs text-stone-500">Можно выбрать несколько жанров.</p>
    </fieldset> : null}
    {decision === "exclude" ? <p className="text-sm leading-6 text-stone-600">Значение останется в исходных данных провайдера, но не будет отображаться как жанр и создавать новые заявки.</p> : null}
    <p className="text-xs leading-5 text-stone-500">Решение применяется к существующим записям в фоне. После сохранения изменить решение в этой форме нельзя.</p>
    <div><SubmitDecision /></div>
  </form>;
}
