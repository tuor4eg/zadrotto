"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type {
  CoverProviderRateLimitValue,
  CoverSettingsValue,
} from "@/db/queries/cover-settings";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import {
  COVER_SETTINGS_FORM_LIMITS,
  formatCoverMaxMegabytes,
} from "@/lib/forms/cover-settings";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import {
  type UpdateCoverSettingsState,
  updateCoverSettingsAction,
} from "../../settings/actions";

const initialState: UpdateCoverSettingsState = {
  error: null,
  success: null,
};

export function ProviderLimitsForm({
  providerRateLimits,
  settings,
}: {
  providerRateLimits: CoverProviderRateLimitValue[];
  settings: CoverSettingsValue;
}) {
  const [state, formAction, isPending] = useActionState(
    updateCoverSettingsAction,
    initialState,
  );
  const toastMessages = [
    ...(state.success ? [{ id: "success", tone: "success" as const, text: state.success }] : []),
    ...(state.error ? [{ id: "error", tone: "error" as const, text: state.error }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="grid gap-5">
      <AdminToasts messages={toastMessages} />

      <form
        action={formAction}
        className="grid gap-4 rounded-md border border-stone-200 bg-stone-50/60 p-4"
        noValidate
      >
        <fieldset className="grid gap-3 rounded-md border border-stone-200 bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Внешние запросы
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {providerRateLimits.map((providerLimit) => (
              <NumberField
                key={providerLimit.providerCode}
                id={`cover-provider-daily-limit-${providerLimit.providerCode}`}
                label={COVER_PROVIDER_LABELS[providerLimit.providerCode]}
                name={`providerSearchesPerDay:${providerLimit.providerCode}`}
                min={COVER_SETTINGS_FORM_LIMITS.providerSearchesPerDay.min}
                max={COVER_SETTINGS_FORM_LIMITS.providerSearchesPerDay.max}
                defaultValue={providerLimit.searchesPerDay.toString()}
                disabled={isPending}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 rounded-md border border-stone-200 bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Обложки
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="cover-candidate-limit"
              label="Вариантов"
              name="candidateLimit"
              min={COVER_SETTINGS_FORM_LIMITS.candidateLimit.min}
              max={COVER_SETTINGS_FORM_LIMITS.candidateLimit.max}
              defaultValue={settings.candidateLimit.toString()}
              disabled={isPending}
            />
            <NumberField
              id="cover-tmdb-scan-limit"
              label="TMDB-скан"
              name="tmdbResultScanLimit"
              min={COVER_SETTINGS_FORM_LIMITS.tmdbResultScanLimit.min}
              max={COVER_SETTINGS_FORM_LIMITS.tmdbResultScanLimit.max}
              defaultValue={settings.tmdbResultScanLimit.toString()}
              disabled={isPending}
            />
            <NumberField
              id="cover-max-megabytes"
              label="Размер, МБ"
              name="coverMaxMegabytes"
              min={COVER_SETTINGS_FORM_LIMITS.coverMaxMegabytes.min}
              max={COVER_SETTINGS_FORM_LIMITS.coverMaxMegabytes.max}
              defaultValue={formatCoverMaxMegabytes(settings.coverMaxBytes)}
              disabled={isPending}
            />
          </div>
        </fieldset>

        <div>
          <Button type="submit" disabled={isPending}>
            <Save />
            {isPending ? "Сохраняем" : "Сохранить"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function NumberField({
  defaultValue,
  disabled,
  id,
  label,
  max,
  min,
  name,
}: {
  defaultValue: string;
  disabled?: boolean;
  id: string;
  label: string;
  max: number;
  min: number;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step="1"
        inputMode="numeric"
        defaultValue={defaultValue}
        disabled={disabled}
      />
    </div>
  );
}
