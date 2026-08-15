"use client";

import {
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  CloudDownload,
  KeyRound,
  LoaderCircle,
  Power,
  PowerOff,
  Stethoscope,
  Save,
  X,
} from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import type {
  CoverProviderCredentialStatus,
  CoverProviderSettingsValue,
  CoverProviderImageSetting,
} from "@/db/queries/cover-settings";
import { cn } from "@/lib/common/utils";
import {
  coverProviderRequiresCredentials,
  getCoverProviderCredentialDefinition,
} from "@/lib/covers/credential-definitions";
import {
  COVER_PROVIDER_LABELS,
  getCoverProviderSettingKey,
} from "@/lib/covers/provider-settings";
import type { MediaTypeOption } from "@/lib/media/types";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import {
  type UpdateCoverProviderCredentialsState,
  type UpdateCoverProviderSettingsState,
  type CoverProviderSmokeTestState,
  testCoverProviderAction,
  updateCoverProviderCredentialsAction,
  updateCoverProviderSettingsAction,
  updateCoverProviderImageSettingAction,
} from "../../settings/actions";

const initialProviderState: UpdateCoverProviderSettingsState = {
  error: null,
  success: null,
};
const STORED_CREDENTIAL_MASK = "stored-credential";

export function ProvidersForm({
  credentialStatuses,
  mediaTypes,
  providerSettings,
  imageSettings,
}: {
  credentialStatuses: CoverProviderCredentialStatus[];
  mediaTypes: MediaTypeOption[];
  providerSettings: CoverProviderSettingsValue[];
  imageSettings: CoverProviderImageSetting[];
}) {
  const [providerState, setProviderState] =
    useState<UpdateCoverProviderSettingsState>(initialProviderState);
  const [isProviderPending, startProviderTransition] = useTransition();
  const [providerGroups, setProviderGroups] = useState(() =>
    groupProviderSettings(providerSettings),
  );
  const [proxiedProviderCodes, setProxiedProviderCodes] = useState(
    () => new Set(imageSettings.filter((setting) => setting.proxyImagesEnabled).map((setting) => setting.providerCode)),
  );
  const [credentialStatusByProviderCode, setCredentialStatusByProviderCode] = useState(
    () => new Map(credentialStatuses.map((status) => [status.providerCode, status])),
  );
  const [credentialModalProvider, setCredentialModalProvider] =
    useState<CoverProviderSettingsValue | null>(null);
  const [smokeTestProvider, setSmokeTestProvider] =
    useState<CoverProviderSettingsValue | null>(null);
  const [draggedProviderKey, setDraggedProviderKey] = useState<string | null>(null);
  const toastMessages = [
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

      <section className="grid gap-4 sm:rounded-md sm:border sm:border-stone-200 sm:bg-white sm:p-4">
        <div className="grid gap-4">
          {providerGroups.map((group) => (
            <fieldset
              key={group.mediaType}
              className="grid gap-3 sm:rounded-md sm:border sm:border-stone-200 sm:p-3"
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
                const proxyImagesEnabled = proxiedProviderCodes.has(provider.providerCode);

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
                      "flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition-colors sm:grid sm:items-center sm:rounded-md sm:border-stone-100 sm:bg-stone-50/60 sm:p-3 sm:shadow-none",
                      requiresCredentials
                        ? "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto_auto]"
                        : "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto]",
                      draggedProviderKey === settingKey && "border-stone-300 bg-stone-100",
                    )}
                  >
                    <div className="flex items-center gap-3 sm:contents">
                      <span
                        className="cursor-grab text-stone-400 active:cursor-grabbing"
                        aria-hidden="true"
                      >
                        <GripVertical className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-stone-900">
                          {COVER_PROVIDER_LABELS[provider.providerCode]}
                        </div>
                        {requiresCredentials ? (
                          <div className="mt-1 truncate text-xs text-stone-500">
                            {hasCredentials ? "Авторизация настроена" : "Авторизация не настроена"}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3 sm:contents">
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
                      <Tooltip label="Проверить доступность">
                        <button
                          type="button"
                          aria-label={`Проверить доступность ${COVER_PROVIDER_LABELS[provider.providerCode]}`}
                          className="inline-flex size-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50"
                          disabled={isProviderPending}
                          onClick={() => setSmokeTestProvider(provider)}
                        >
                          <Stethoscope className="size-4" />
                        </button>
                      </Tooltip>
                      <Select
                        aria-label={`Поиск названий: ${COVER_PROVIDER_LABELS[provider.providerCode]}`}
                        className="order-first h-9 w-full text-xs sm:order-none sm:w-[9.5rem]"
                        disabled={isProviderPending || !provider.enabled || !canEnable}
                        value={provider.titleSearchMode}
                        onChange={(event) =>
                          updateProviderAndSave(settingKey, {
                            titleSearchMode: event.currentTarget.value as CoverProviderSettingsValue["titleSearchMode"],
                          })
                        }
                      >
                        <option value="parallel">Названия: сразу</option>
                        <option value="fallback">Названия: резерв</option>
                        <option value="off">Названия: выкл.</option>
                      </Select>
                      <Tooltip
                        label={
                          !provider.coverSearchEnabled && !canEnable
                            ? "Сначала авторизуйтесь"
                            : provider.coverSearchEnabled
                              ? "Выключить поиск обложек"
                              : "Включить поиск обложек"
                        }
                      >
                      <button
                        type="button"
                        aria-label={`${provider.coverSearchEnabled ? "Выключить" : "Включить"} поиск обложек ${
                          COVER_PROVIDER_LABELS[provider.providerCode]}`}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
                          provider.coverSearchEnabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-stone-200 bg-white text-stone-400 hover:bg-stone-100 hover:text-stone-700",
                        )}
                        disabled={
                          isProviderPending || !provider.enabled || !canEnable
                        }
                        onClick={() =>
                          updateProviderAndSave(settingKey, {
                            coverSearchEnabled: !provider.coverSearchEnabled,
                          })
                        }
                      >
                        {provider.coverSearchEnabled ? (
                          <ImageIcon className="size-4" />
                        ) : (
                          <ImageOff className="size-4" />
                        )}
                      </button>
                      </Tooltip>
                      <Tooltip label={proxyImagesEnabled ? "Загружать изображения напрямую" : "Загружать изображения через сервер"}>
                      <button
                        type="button"
                        aria-label={`${proxyImagesEnabled ? "Выключить" : "Включить"} загрузку изображений через сервер для ${COVER_PROVIDER_LABELS[provider.providerCode]}`}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
                          proxyImagesEnabled
                            ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                            : "border-stone-200 bg-white text-stone-400 hover:bg-stone-100 hover:text-stone-700",
                        )}
                        disabled={isProviderPending}
                        onClick={() => saveImageSetting(provider.providerCode, !proxyImagesEnabled)}
                      >
                        <CloudDownload className="size-4" />
                      </button>
                      </Tooltip>
                      <div className="ml-auto border-l border-stone-200 pl-3 sm:ml-1">
                      <Tooltip
                        label={
                          !provider.enabled && !canEnable
                            ? "Сначала авторизуйтесь"
                            : provider.enabled
                              ? "Выключить провайдера"
                              : "Включить провайдера"
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
                          onClick={() =>
                            updateProviderAndSave(settingKey, {
                              enabled: !provider.enabled,
                            })
                          }
                        >
                          {provider.enabled ? (
                            <Power className="size-4" />
                          ) : (
                            <PowerOff className="size-4" />
                          )}
                        </button>
                      </Tooltip>
                      </div>
                    </div>
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
      {smokeTestProvider ? (
        <ProviderSmokeTestModal
          provider={smokeTestProvider}
          onClose={() => setSmokeTestProvider(null)}
        />
      ) : null}
    </div>
  );

  function updateProviderAndSave(
    settingKey: string,
    update: Partial<
      Pick<CoverProviderSettingsValue, "coverSearchEnabled" | "titleSearchMode">
      & Pick<CoverProviderSettingsValue, "enabled">
    >,
  ) {
    const nextGroups = providerGroups.map((group) => ({
      ...group,
      providers: group.providers.map((provider) =>
        getCoverProviderSettingKey(provider) === settingKey
          ? {
              ...provider,
              ...update,
            }
          : provider,
      ),
    }));

    saveProviderGroups(nextGroups, providerGroups);
  }

  function saveImageSetting(providerCode: CoverProviderSettingsValue["providerCode"], enabled: boolean) {
    const previous = new Set(proxiedProviderCodes);
    const next = new Set(previous);
    if (enabled) next.add(providerCode); else next.delete(providerCode);
    setProxiedProviderCodes(next);
    setProviderState(initialProviderState);
    startProviderTransition(async () => {
      const state = await updateCoverProviderImageSettingAction(providerCode, enabled);
      setProviderState(state);
      if (state.error) setProxiedProviderCodes(previous);
    });
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
      formData.set(
        `providerTitleSearchMode:${settingKey}`,
        provider.titleSearchMode,
      );

      if (provider.coverSearchEnabled) {
        formData.set(`providerCoverSearchEnabled:${settingKey}`, "1");
      }
    });
  }

  return formData;
}

function getMediaTypeName(mediaType: string, mediaTypes: readonly MediaTypeOption[]) {
  return mediaTypes.find((item) => item.code === mediaType)?.name ?? mediaType;
}

function ProviderSmokeTestModal({
  onClose,
  provider,
}: {
  onClose: () => void;
  provider: CoverProviderSettingsValue;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [result, setResult] = useState<CoverProviderSmokeTestState | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setResult(await testCoverProviderAction(provider.providerCode, provider.mediaType));
    });
  }, [provider.mediaType, provider.providerCode]);

  const status = result
    ? result.ok
      ? {
          title: "Провайдер доступен",
          description: result.candidateTitle
            ? `Найден пример: ${result.candidateTitle}`
            : "Запрос выполнен, но ничего не найдено.",
          className: "border-emerald-200 bg-emerald-50 text-emerald-900",
        }
      : {
          title: "Проверка не пройдена",
          description: getSmokeTestErrorMessage(result.error),
          className: "border-amber-200 bg-amber-50 text-amber-900",
        }
    : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть окно проверки"
        disabled={isPending}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
      >
        <div>
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            Проверка · {COVER_PROVIDER_LABELS[provider.providerCode]}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">
            Выполняем тестовый поиск записи у провайдера.
          </p>
        </div>

        {isPending ? (
          <div className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
            <LoaderCircle className="size-5 animate-spin" />
            Проверяем доступность…
          </div>
        ) : status ? (
          <div className={`grid gap-2 rounded-md border p-4 text-sm ${status.className}`}>
            <div className="font-medium">{status.title}</div>
            <p className="leading-6">{status.description}</p>
            {result && !result.ok && result.httpStatus ? (
              <div className="font-mono text-xs">HTTP {result.httpStatus}</div>
            ) : null}
            {result && !result.ok && result.providerMessage ? (
              <div className="break-words rounded border border-current/15 bg-white/50 p-2 font-mono text-xs leading-5">
                {result.providerMessage}
              </div>
            ) : null}
            {result && result.latencyMs !== null ? (
              <div className="text-xs opacity-75">Ответ за {formatLatency(result.latencyMs)}.</div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" disabled={isPending} onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

function getSmokeTestErrorMessage(error: Extract<CoverProviderSmokeTestState, { ok: false }> ["error"]) {
  const messages = {
    "invalid-provider": "Этот провайдер не поддерживает выбранный тип записи.",
    "missing-credentials": "Сначала сохраните данные авторизации провайдера.",
    timeout: "Провайдер не ответил вовремя.",
    "invalid-credentials": "Провайдер не принял сохранённые данные авторизации.",
    "rate-limited": "Провайдер временно ограничил запросы. Попробуйте позже.",
    unavailable: "Внешний провайдер временно недоступен. Попробуйте позже.",
  } as const;

  return messages[error];
}

function formatLatency(latencyMs: number) {
  return latencyMs < 1_000 ? `${latencyMs} мс` : `${(latencyMs / 1_000).toFixed(1)} с`;
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
