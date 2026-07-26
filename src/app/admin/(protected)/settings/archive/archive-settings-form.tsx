"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
  updateArchiveSettingsAction,
  type UpdateArchiveSettingsState,
} from "../actions";

const initialState: UpdateArchiveSettingsState = { error: null, success: null };

export function ArchiveSettingsForm({
  mediaItemTitleAliasLimit,
  maxFranchiseDepth,
}: {
  mediaItemTitleAliasLimit: number;
  maxFranchiseDepth: number;
}) {
  const [state, formAction, isPending] = useActionState(
    updateArchiveSettingsAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="media-item-title-alias-limit">Максимум альтернативных названий</Label>
        <Input
          id="media-item-title-alias-limit"
          name="mediaItemTitleAliasLimit"
          type="number"
          min={1}
          max={10}
          defaultValue={mediaItemTitleAliasLimit}
          required
        />
        <p className="text-xs leading-5 text-stone-500">
          Допустимое значение: от 1 до 10. Если уменьшить лимит, существующие названия не
          удалятся, но записи с превышением нельзя будет сохранить до удаления лишних значений.
        </p>
      </div>
      <div className="grid gap-2"><Label htmlFor="max-franchise-depth">Максимальная глубина серий</Label><Input id="max-franchise-depth" name="maxFranchiseDepth" type="number" min={2} max={5} defaultValue={maxFranchiseDepth} required /><p className="text-xs leading-5 text-stone-500">Корневая серия считается первым уровнем: Marvel → Avengers → Spider-Man — глубина 3. Допустимо от 2 до 5.</p></div>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={isPending}>
        Сохранить
      </Button>
    </form>
  );
}
