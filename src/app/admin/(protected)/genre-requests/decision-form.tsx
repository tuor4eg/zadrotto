"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { MediaItemGenre } from "@/lib/media/genres";

function SubmitDecision() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Сохранение…" : "Сохранить решение"}</Button>;
}

export function GenreRequestDecisionForm({ requestId, genres, action }: {
  requestId: number; genres: readonly MediaItemGenre[]; action: (formData: FormData) => Promise<void>;
}) {
  const [decision, setDecision] = useState("map");
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
      {genres.length ? <div className="grid gap-2 sm:grid-cols-2">{genres.map((genre) => <label key={genre.id} className="flex min-w-0 items-start gap-2 text-sm">
        <input type="checkbox" name="genreIds" value={genre.id} className="mt-0.5" /><span className="break-words">{genre.name}</span>
      </label>)}</div> : <p className="text-sm text-stone-500">Нет активных жанров. Можно создать новый.</p>}
      <p className="mt-3 text-xs text-stone-500">Можно выбрать несколько жанров.</p>
    </fieldset> : null}
    {decision === "exclude" ? <p className="text-sm leading-6 text-stone-600">Значение останется в исходных данных провайдера, но не будет отображаться как жанр и создавать новые заявки.</p> : null}
    <p className="text-xs leading-5 text-stone-500">Решение применяется к существующим записям в фоне. После сохранения изменить решение в этой форме нельзя.</p>
    <div><SubmitDecision /></div>
  </form>;
}
