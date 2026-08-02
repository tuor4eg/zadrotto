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
  dailyDossierMinAverageScore,
  mediaItemTitleAliasLimit,
  maxFranchiseDepth,
  recentlyViewedHistoryLimit,
  recentlyViewedTtlDays,
}: {
  dailyDossierMinAverageScore: number;
  mediaItemTitleAliasLimit: number;
  maxFranchiseDepth: number;
  recentlyViewedHistoryLimit: number;
  recentlyViewedTtlDays: number;
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
      <div className="grid gap-2">
        <Label htmlFor="recently-viewed-history-limit">Размер истории просмотров</Label>
        <Input id="recently-viewed-history-limit" name="recentlyViewedHistoryLimit" type="number" min={1} max={500} defaultValue={recentlyViewedHistoryLimit} required />
        <p className="text-xs leading-5 text-stone-500">Сколько последних записей хранить для каждого автора: от 1 до 500.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recently-viewed-ttl-days">Срок хранения истории, дней</Label>
        <Input id="recently-viewed-ttl-days" name="recentlyViewedTtlDays" type="number" min={1} max={365} defaultValue={recentlyViewedTtlDays} required />
        <p className="text-xs leading-5 text-stone-500">История удаляется после периода без новых просмотров: от 1 до 365 дней.</p>
      </div>
      <div className="grid gap-2"><Label htmlFor="max-franchise-depth">Максимальная глубина серий</Label><Input id="max-franchise-depth" name="maxFranchiseDepth" type="number" min={2} max={5} defaultValue={maxFranchiseDepth} required /><p className="text-xs leading-5 text-stone-500">Корневая серия считается первым уровнем: Marvel → Avengers → Spider-Man — глубина 3. Допустимо от 2 до 5.</p></div>
      <div className="grid gap-2">
        <Label htmlFor="daily-dossier-min-average-score">
          Минимальная средняя оценка «Досье дня»
        </Label>
        <Input
          id="daily-dossier-min-average-score"
          name="dailyDossierMinAverageScore"
          type="number"
          min={0}
          max={10}
          defaultValue={dailyDossierMinAverageScore}
          required
        />
        <p className="text-xs leading-5 text-stone-500">
          Запись должна иметь среднюю оценку не ниже указанной. Значение 0 разрешает
          выбирать записи без оценок.
        </p>
      </div>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={isPending}>
        Сохранить
      </Button>
    </form>
  );
}
