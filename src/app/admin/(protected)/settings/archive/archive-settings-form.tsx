"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { AutomoderationMode } from "@/lib/automoderation/model";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import {
  updateArchiveSettingsAction,
  type UpdateArchiveSettingsState,
} from "../actions";

const initialState: UpdateArchiveSettingsState = { error: null, success: null };

export function ArchiveSettingsForm({
  exportRetentionDays,
  mediaAutoModerationMode,
  dailyDossierMinAverageScore,
  dailyDossierMinRatingsCount,
  mediaItemTitleAliasLimit,
  maxFranchiseDepth,
  recentlyViewedHistoryLimit,
  recentlyViewedTtlDays,
  topArchiveMinAverageScore,
  topArchiveMinRatingsCount,
}: {
  exportRetentionDays: number;
  mediaAutoModerationMode: AutomoderationMode;
  dailyDossierMinAverageScore: number;
  dailyDossierMinRatingsCount: number;
  mediaItemTitleAliasLimit: number;
  maxFranchiseDepth: number;
  recentlyViewedHistoryLimit: number;
  recentlyViewedTtlDays: number;
  topArchiveMinAverageScore: number;
  topArchiveMinRatingsCount: number;
}) {
  const [state, formAction, isPending] = useActionState(
    updateArchiveSettingsAction,
    initialState,
  );
  const toastMessages = [
    ...(state.success ? [{ id: "archive-settings-success", tone: "success" as const, text: state.success }] : []),
    ...(state.error ? [{ id: "archive-settings-error", tone: "error" as const, text: state.error }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={formAction} className="grid max-w-4xl gap-3 lg:grid-cols-2">
      <AdminToasts messages={toastMessages} />
      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">Автомодерация записей</legend>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="media-auto-moderation-mode">Режим</Label>
          <Select id="media-auto-moderation-mode" name="mediaAutoModerationMode" defaultValue={mediaAutoModerationMode}>
            <option value="off">Выключена</option>
            <option value="shadow">Теневая проверка</option>
            <option value="enforce">Автоматическая публикация</option>
          </Select>
          <p className="text-xs leading-4 text-stone-500">Теневой режим сохраняет решение, но оставляет заявку администратору.</p>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">Топ архива</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="top-archive-min-average-score">Минимальная средняя оценка «Топа архива»</Label>
            <Input id="top-archive-min-average-score" name="topArchiveMinAverageScore" type="number" min={0} max={10} defaultValue={topArchiveMinAverageScore} required />
            <p className="text-xs leading-4 text-stone-500">0–10, ноль отключает порог.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="top-archive-min-ratings-count">Минимальное число оценок</Label>
            <Input id="top-archive-min-ratings-count" name="topArchiveMinRatingsCount" type="number" min={0} max={1000} defaultValue={topArchiveMinRatingsCount} required />
            <p className="text-xs leading-4 text-stone-500">От 0 до 1000. Значение 0 отключает ограничение и допускает записи без оценок.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">Досье дня</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="daily-dossier-min-average-score">Минимальная средняя оценка «Досье дня»</Label>
            <Input id="daily-dossier-min-average-score" name="dailyDossierMinAverageScore" type="number" min={0} max={10} defaultValue={dailyDossierMinAverageScore} required />
            <p className="text-xs leading-4 text-stone-500">0–10, ноль отключает порог.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="daily-dossier-min-ratings-count">Минимальное число оценок</Label>
            <Input id="daily-dossier-min-ratings-count" name="dailyDossierMinRatingsCount" type="number" min={0} max={1000} defaultValue={dailyDossierMinRatingsCount} required />
            <p className="text-xs leading-4 text-stone-500">От 0 до 1000. Значение 0 допускает любое количество оценок.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">История просмотров</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="recently-viewed-history-limit">Размер истории</Label>
            <Input id="recently-viewed-history-limit" name="recentlyViewedHistoryLimit" type="number" min={1} max={500} defaultValue={recentlyViewedHistoryLimit} required />
            <p className="text-xs leading-4 text-stone-500">От 1 до 500 записей.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="recently-viewed-ttl-days">Срок хранения, дней</Label>
            <Input id="recently-viewed-ttl-days" name="recentlyViewedTtlDays" type="number" min={1} max={365} defaultValue={recentlyViewedTtlDays} required />
            <p className="text-xs leading-4 text-stone-500">От 1 до 365 дней без новых просмотров.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">Записи и серии</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="media-item-title-alias-limit">Альтернативных названий</Label>
            <Input id="media-item-title-alias-limit" name="mediaItemTitleAliasLimit" type="number" min={1} max={10} defaultValue={mediaItemTitleAliasLimit} required />
            <p className="text-xs leading-4 text-stone-500">От 1 до 10 на одну запись.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label className="flex min-h-10 items-end" htmlFor="max-franchise-depth">Максимальная глубина серий</Label>
            <Input id="max-franchise-depth" name="maxFranchiseDepth" type="number" min={2} max={5} defaultValue={maxFranchiseDepth} required />
            <p className="text-xs leading-4 text-stone-500">От 2 до 5. Marvel → Avengers → Spider-Man — глубина 3.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-900">Экспорты</legend>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="export-retention-days">Срок хранения файлов, дней</Label>
          <Input id="export-retention-days" name="exportRetentionDays" type="number" min={1} max={90} defaultValue={exportRetentionDays} required />
          <p className="text-xs leading-4 text-stone-500">От 1 до 90 дней после создания выгрузки.</p>
        </div>
      </fieldset>

      <div className="lg:col-span-2">
        <Button type="submit" disabled={isPending}>Сохранить</Button>
      </div>
    </form>
  );
}
