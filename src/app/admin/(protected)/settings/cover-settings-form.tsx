"use client";

import { GripVertical, KeyRound, Power, PowerOff, Save, X } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import {
  COVER_SETTINGS_FORM_LIMITS,
  formatCoverMaxMegabytes,
} from "@/lib/forms/cover-settings";
import {
  COVER_PROVIDER_LABELS,
  getCoverProviderSettingKey,
} from "@/lib/covers/provider-settings";
import type { MediaTypeOption } from "@/lib/media/types";
import type {
  CoverProviderCredentialStatus,
  CoverProviderRateLimitValue,
  CoverProviderSettingsValue,
  CoverSettingsValue,
} from "@/db/queries/cover-settings";
import { Tooltip } from "@/components/ui/tooltip";
import {
  coverProviderRequiresCredentials,
  getCoverProviderCredentialDefinition,
} from "@/lib/covers/credential-definitions";
import { cn } from "@/lib/common/utils";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import {
  type UpdateCoverProviderCredentialsState,
  type UpdateCoverProviderSettingsState,
  type UpdateCoverSettingsState,
  updateCoverProviderCredentialsAction,
  updateCoverProviderSettingsAction,
  updateCoverSettingsAction,
} from "./actions";

const initialState: UpdateCoverSettingsState = {
  error: null,
  success: null,
};
const initialProviderState: UpdateCoverProviderSettingsState = {
  error: null,
  success: null,
};
const STORED_CREDENTIAL_MASK = "stored-credential";

export function CoverSettingsForm({
  credentialStatuses,
  mediaTypes,
  providerRateLimits,
  providerSettings,
  settings,
}: {
  credentialStatuses: CoverProviderCredentialStatus[];
  mediaTypes: MediaTypeOption[];
  providerRateLimits: CoverProviderRateLimitValue[];
  providerSettings: CoverProviderSettingsValue[];
  settings: CoverSettingsValue;
}) {
  const [state, formAction, isPending] = useActionState(
    updateCoverSettingsAction,
    initialState,
  );
  const [providerState, setProviderState] =
    useState<UpdateCoverProviderSettingsState>(initialProviderState);
  const [isProviderPending, startProviderTransition] = useTransition();
  const [providerGroups, setProviderGroups] = useState(() =>
    groupProviderSettings(providerSettings),
  );
  const [credentialStatusByProviderCode, setCredentialStatusByProviderCode] = useState(
    () => new Map(credentialStatuses.map((status) => [status.providerCode, status])),
  );
  const [credentialModalProvider, setCredentialModalProvider] =
    useState<CoverProviderSettingsValue | null>(null);
  const [draggedProviderKey, setDraggedProviderKey] = useState<string | null>(null);
  const toastMessages = [
    ...(state.success ? [{ id: "success", tone: "success" as const, text: state.success }] : []),
    ...(state.error ? [{ id: "error", tone: "error" as const, text: state.error }] : []),
    ...(providerState.success
      ? [{ id: "provider-success", tone: "success" as const, text: providerState.success }]
      : []),
    ...(providerState.error
      ? [{ id: "provider-error", tone: "error" as const, text: providerState.error }]
      : []),
  ] satisfies AdminToast[];

  return (
    <div className="grid gap-5">
      <AdminToasts messages={toastMessages} />

      <form
        action={formAction}
        className="grid gap-4 rounded-md border border-stone-200 bg-stone-50/60 p-4"
        noValidate
      >
        <h3 className="text-sm font-semibold text-stone-950">Лимиты</h3>
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
        <fieldset className="grid gap-3 rounded-md border border-stone-200 bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Провайдеры в сутки
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
        <div>
          <Button type="submit" disabled={isPending}>
            <Save />
            {isPending ? "Сохраняем" : "Сохранить"}
          </Button>
        </div>
      </form>

      <section className="grid gap-4 rounded-md border border-stone-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">Провайдеры</h3>
        </div>

        <div className="grid gap-4">
          {providerGroups.map((group) => (
            <fieldset
              key={group.mediaType}
              className="grid gap-3 rounded-md border border-stone-200 p-3"
            >
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {getMediaTypeName(group.mediaType, mediaTypes)}
              </legend>
              {group.providers.map((provider) => {
                const settingKey = getCoverProviderSettingKey(provider);
                const requiresCredentials = coverProviderRequiresCredentials(provider.providerCode);
                const credentialStatus = credentialStatusByProviderCode.get(provider.providerCode);
                const hasCredentials = Boolean(credentialStatus?.hasCredentials);
                const canEnable = !requiresCredentials || hasCredentials;

                return (
                  <div
                    key={settingKey}
                    draggable={!isProviderPending}
                    onDragStart={(event) => {
                      setDraggedProviderKey(settingKey);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", settingKey);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveProviderAndSave({
                        fromKey:
                          draggedProviderKey || event.dataTransfer.getData("text/plain"),
                        toKey: settingKey,
                      });
                    }}
                    onDragEnd={() => setDraggedProviderKey(null)}
                    className={cn(
                      "grid items-center gap-3 rounded-md border border-stone-100 bg-stone-50/60 p-3 transition-colors",
                      requiresCredentials
                        ? "grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                        : "grid-cols-[auto_minmax(0,1fr)_auto]",
                      draggedProviderKey === settingKey && "border-stone-300 bg-stone-100",
                    )}
                  >
                    <span
                      className="cursor-grab text-stone-400 active:cursor-grabbing"
                      aria-hidden="true"
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">
                        {COVER_PROVIDER_LABELS[provider.providerCode]}
                      </div>
                      {requiresCredentials ? (
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {hasCredentials ? "Авторизация настроена" : "Авторизация не настроена"}
                        </div>
                      ) : null}
                    </div>
                    {requiresCredentials ? (
                      <Tooltip label="Данные авторизации">
                        <button
                          type="button"
                          aria-label={`Данные авторизации ${COVER_PROVIDER_LABELS[provider.providerCode]}`}
                          className={cn(
                            "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
                            hasCredentials
                              ? "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                              : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                          )}
                          disabled={isProviderPending}
                          onClick={() => setCredentialModalProvider(provider)}
                        >
                          <KeyRound className="size-4" />
                        </button>
                      </Tooltip>
                    ) : null}
                    <Tooltip
                      label={
                        !provider.enabled && !canEnable
                          ? "Сначала авторизуйтесь"
                          : provider.enabled
                            ? "Выключить"
                            : "Включить"
                      }
                    >
                      <button
                        type="button"
                        aria-label={`${provider.enabled ? "Выключить" : "Включить"} ${
                          COVER_PROVIDER_LABELS[provider.providerCode]
                        }`}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
                          provider.enabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-stone-200 bg-white text-stone-400 hover:bg-stone-100 hover:text-stone-700",
                        )}
                        disabled={isProviderPending || (!provider.enabled && !canEnable)}
                        onClick={() => toggleProviderAndSave(settingKey)}
                      >
                        {provider.enabled ? (
                          <Power className="size-4" />
                        ) : (
                          <PowerOff className="size-4" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </section>

      {credentialModalProvider ? (
        <ProviderCredentialsModal
          hasExistingCredentials={Boolean(
            credentialStatusByProviderCode.get(credentialModalProvider.providerCode)
              ?.hasCredentials,
          )}
          provider={credentialModalProvider}
          onClose={() => setCredentialModalProvider(null)}
          onSaved={(status) => {
            setCredentialStatusByProviderCode((statuses) => {
              const nextStatuses = new Map(statuses);
              nextStatuses.set(status.providerCode, status);

              return nextStatuses;
            });
            setCredentialModalProvider(null);
          }}
        />
      ) : null}
    </div>
  );

  function toggleProviderAndSave(settingKey: string) {
    const nextGroups = providerGroups.map((group) => ({
      ...group,
      providers: group.providers.map((provider) =>
        getCoverProviderSettingKey(provider) === settingKey
          ? { ...provider, enabled: !provider.enabled }
          : provider,
      ),
    }));

    saveProviderGroups(nextGroups, providerGroups);
  }

  function moveProviderAndSave(input: {
    fromKey: string;
    toKey: string;
  }) {
    if (!input.fromKey || input.fromKey === input.toKey) {
      return;
    }

    const nextGroups = providerGroups.map((group) => {
      const fromIndex = group.providers.findIndex(
        (provider) => getCoverProviderSettingKey(provider) === input.fromKey,
      );
      const toIndex = group.providers.findIndex(
        (provider) => getCoverProviderSettingKey(provider) === input.toKey,
      );

      if (fromIndex < 0 || toIndex < 0) {
        return group;
      }

      const providers = [...group.providers];
      const [movedProvider] = providers.splice(fromIndex, 1);

      if (!movedProvider) {
        return group;
      }

      providers.splice(toIndex, 0, movedProvider);

      return {
        ...group,
        providers,
      };
    });

    saveProviderGroups(nextGroups, providerGroups);
  }

  function saveProviderGroups(
    nextGroups: ReturnType<typeof groupProviderSettings>,
    previousGroups: ReturnType<typeof groupProviderSettings>,
  ) {
    setProviderGroups(nextGroups);
    setProviderState(initialProviderState);

    startProviderTransition(async () => {
      const nextState = await updateCoverProviderSettingsAction(
        initialProviderState,
        buildProviderSettingsFormData(nextGroups),
      );

      setProviderState(nextState);

      if (nextState.error) {
        setProviderGroups(previousGroups);
      }
    });
  }
}

function buildProviderSettingsFormData(groups: ReturnType<typeof groupProviderSettings>) {
  const formData = new FormData();

  for (const group of groups) {
    group.providers.forEach((provider, providerIndex) => {
      const settingKey = getCoverProviderSettingKey(provider);
      const priority = (providerIndex + 1) * 10;

      formData.append("providerSettingKey", settingKey);
      formData.set(`providerPriority:${settingKey}`, String(priority));

      if (provider.enabled) {
        formData.set(`providerEnabled:${settingKey}`, "1");
      }
    });
  }

  return formData;
}

function getMediaTypeName(mediaType: string, mediaTypes: readonly MediaTypeOption[]) {
  return mediaTypes.find((item) => item.code === mediaType)?.name ?? mediaType;
}

function ProviderCredentialsModal({
  hasExistingCredentials,
  onClose,
  onSaved,
  provider,
}: {
  hasExistingCredentials: boolean;
  onClose: () => void;
  onSaved: (status: CoverProviderCredentialStatus) => void;
  provider: CoverProviderSettingsValue;
}) {
  const definition = getCoverProviderCredentialDefinition(provider.providerCode);
  const titleId = useId();
  const descriptionId = useId();
  const [state, setState] = useState<UpdateCoverProviderCredentialsState>({
    error: null,
    success: null,
  });
  const [areCredentialFieldsReady, setAreCredentialFieldsReady] =
    useState(!hasExistingCredentials);
  const [isPending, startTransition] = useTransition();

  if (!definition) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть окно авторизации"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative grid w-full max-w-lg gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Авторизация {COVER_PROVIDER_LABELS[provider.providerCode]}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">
              Данные будут зашифрованы перед записью в базу.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <AdminToasts
          messages={[
            ...(state.success ? [{ id: "success", tone: "success" as const, text: state.success }] : []),
            ...(state.error ? [{ id: "error", tone: "error" as const, text: state.error }] : []),
          ]}
        />

        <div className="grid gap-4">
          {definition.fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={`credential-${provider.providerCode}-${field.name}`}>
                {field.label}
              </Label>
              <Input
                id={`credential-${provider.providerCode}-${field.name}`}
                name={`credential:${field.name}`}
                type="password"
                autoComplete="off"
                defaultValue={hasExistingCredentials ? STORED_CREDENTIAL_MASK : ""}
                placeholder={"placeholder" in field ? field.placeholder : undefined}
                disabled={isPending}
                onFocus={(event) => {
                  if (event.currentTarget.value === STORED_CREDENTIAL_MASK) {
                    event.currentTarget.value = "";
                  }

                  setAreCredentialFieldsReady(
                    areCredentialFieldsFilled(event.currentTarget.closest("[role='dialog']")),
                  );
                }}
                onInput={(event) => {
                  setAreCredentialFieldsReady(
                    areCredentialFieldsFilled(event.currentTarget.closest("[role='dialog']")),
                  );
                }}
                data-credential-field
                data-has-stored-credential={hasExistingCredentials ? "true" : undefined}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={isPending || !areCredentialFieldsReady}
            onClick={(event) => {
              const dialog = event.currentTarget.closest("[role='dialog']");
              const formData = new FormData();

              formData.set("providerCode", provider.providerCode);
              dialog
                ?.querySelectorAll<HTMLInputElement>("[data-credential-field]")
                .forEach((input) => formData.set(input.name, input.value));

              startTransition(async () => {
                const nextState = await updateCoverProviderCredentialsAction(state, formData);

                setState(nextState);

                if (!nextState.error) {
                  onSaved({
                    providerCode: provider.providerCode,
                    hasCredentials: true,
                    keyHint: null,
                    updatedAt: new Date(),
                  });
                }
              });
            }}
          >
            <Save />
            {isPending
              ? "Проверяем"
              : areCredentialFieldsReady
                ? "Авторизоваться"
                : "Введите новые данные"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function areCredentialFieldsFilled(container: Element | null) {
  const fields = container?.querySelectorAll<HTMLInputElement>("[data-credential-field]");

  if (!fields?.length) {
    return false;
  }

  return Array.from(fields).every((field) => {
    const value = field.value.trim();

    return Boolean(value) && value !== STORED_CREDENTIAL_MASK;
  });
}

function groupProviderSettings(providerSettings: readonly CoverProviderSettingsValue[]) {
  const groups = new Map<string, CoverProviderSettingsValue[]>();

  for (const provider of providerSettings) {
    groups.set(provider.mediaType, [...(groups.get(provider.mediaType) ?? []), provider]);
  }

  return [...groups.entries()].map(([mediaType, providers]) => ({
    mediaType,
    providers,
  }));
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
