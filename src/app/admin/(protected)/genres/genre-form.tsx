import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { AdminGenre } from "@/db/queries/genres";
import { AdminToasts, type AdminToast } from "../admin-toasts";

export function GenreForm({ genre, action, errorMessage, updated }: {
  genre: AdminGenre;
  action: (formData: FormData) => Promise<void>;
  errorMessage: string | null;
  updated: boolean;
}) {
  const messages = [
    ...(updated ? [{ id: "success", tone: "success" as const, text: "Название жанра сохранено." }] : []),
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
      <div><Button type="submit"><Save />Сохранить</Button></div>
    </form>
  );
}
