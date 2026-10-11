"use client";

import { Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { AdminGenre } from "@/db/queries/genres";
import { SearchableFranchiseSelect, type SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";
import { AdminToasts, type AdminToast } from "../admin-toasts";

export function GenreForm({ genre, franchiseOptions, action, errorMessage, updated }: {
  genre: AdminGenre;
  franchiseOptions: SearchableFranchiseOption[];
  action: (formData: FormData) => Promise<void>;
  errorMessage: string | null;
  updated: boolean;
}) {
  const [replacementFranchiseId, setReplacementFranchiseId] = useState(genre.replacementFranchiseId ? String(genre.replacementFranchiseId) : "");
  const messages = [
    ...(updated ? [{ id: "success", tone: "success" as const, text: "Жанр сохранён." }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];
  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["error", "updated"]} messages={messages} />
      <input type="hidden" name="genreId" value={genre.id} />
      <div className="grid gap-2">
        <Label htmlFor="genre-name">Название</Label>
        <Input id="genre-name" name="name" defaultValue={genre.name} required aria-describedby="genre-name-hint" />
        <p id="genre-name-hint" className="text-xs leading-5 text-stone-500">
          Название используется во всех карточках записей с этим жанром.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="genre-replacement-series">Заменяющая серия</Label>
        <SearchableFranchiseSelect id="genre-replacement-series" name="replacementFranchiseId" options={franchiseOptions}
          emptyLabel="Без замены" value={replacementFranchiseId} onChange={setReplacementFranchiseId} />
        <p className="text-xs leading-5 text-stone-500">
          Жанр скрывается у пользователя, только когда запись входит в опубликованную серию или её опубликованную дочернюю серию через опубликованную связь. В остальных случаях жанр остаётся видимым.
        </p>
        {genre.replacementFranchise && genre.replacementFranchise.publicationStatus !== "published" ?
          <p className="text-xs leading-5 text-amber-800">Текущая серия: {PUBLICATION_STATUS_VALUE_LABELS[genre.replacementFranchise.publicationStatus]}. Пока серия не опубликована, жанр остаётся видимым.</p> : null}
      </div>
      <div><Button type="submit"><Save />Сохранить</Button></div>
    </form>
  );
}
