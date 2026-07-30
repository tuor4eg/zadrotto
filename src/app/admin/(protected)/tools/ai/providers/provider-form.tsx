"use client";

import {
  KeyRound,
  MessageSquareText,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Settings,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/common/utils";
import type { AiFieldDefinition, AiModel } from "@/lib/ai/types";
import {
  type AiProviderActionState,
  listAiModelsAction,
  saveAiProviderCredentialsAction,
  saveAiProviderSettingsAction,
  smokeTestAiProviderModelAction,
  testAiProviderAction,
  toggleAiProviderAction,
} from "./actions";
import { AdminToasts, type AdminToast } from "../../../admin-toasts";

type ProviderView = {
  code: string;
  label: string;
  credentialFields: readonly AiFieldDefinition[];
  settingFields: readonly AiFieldDefinition[];
};

type ProviderSettings = {
  enabled: boolean;
  defaultModelId: string | null;
  settings: Record<string, unknown>;
};

type ProviderCredential = {
  keyHint: string;
};

const initialActionState: AiProviderActionState = { error: null, success: null };

export function AiProvidersForm({
  providers,
}: {
  providers: {
    adapter: ProviderView;
    settings?: ProviderSettings;
    credential?: ProviderCredential;
  }[];
}) {
  const router = useRouter();
  const [providerStates, setProviderStates] = useState(() =>
    new Map(providers.map(({ adapter, settings, credential }) => [
      adapter.code,
      {
        enabled: settings?.enabled ?? false,
        hasCredentials: Boolean(credential),
        keyHint: credential?.keyHint ?? null,
        defaultModelId: settings?.defaultModelId ?? null,
      },
    ])),
  );
  const [credentialProvider, setCredentialProvider] = useState<ProviderView | null>(null);
  const [settingsProvider, setSettingsProvider] = useState<ProviderView | null>(null);
  const [smokeTestProvider, setSmokeTestProvider] = useState<ProviderView | null>(null);
  const [message, setMessage] = useState<AiProviderActionState>(initialActionState);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      <AdminToasts messages={getActionToasts(message, "provider-list")} />

      <section className="grid gap-3 rounded-md border border-stone-200 bg-white p-3 sm:p-4">
        {providers.map(({ adapter }) => {
          const state = providerStates.get(adapter.code) ?? {
            enabled: false,
            hasCredentials: false,
            keyHint: null,
            defaultModelId: null,
          };
          const providerPending = isPending && pendingCode === adapter.code;

          return (
            <div
              key={adapter.code}
              className="flex flex-col gap-3 rounded-md border border-stone-100 bg-stone-50/60 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-900">{adapter.label}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span className={state.hasCredentials ? "text-emerald-700" : "text-amber-700"}>
                    {state.hasCredentials
                      ? `Авторизация настроена${state.keyHint ? ` · ${state.keyHint}` : ""}`
                      : "Авторизация не настроена"}
                  </span>
                  <span>{state.enabled ? "Провайдер включён" : "Провайдер выключен"}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Tooltip label="Данные авторизации">
                  <button
                    type="button"
                    aria-label={`Данные авторизации ${adapter.label}`}
                    className={iconButtonClass(state.hasCredentials ? "ready" : "warning")}
                    disabled={providerPending}
                    onClick={() => {
                      setMessage(initialActionState);
                      setSettingsProvider(null);
                      setSmokeTestProvider(null);
                      setCredentialProvider(adapter);
                    }}
                  >
                    <KeyRound className="size-4" />
                  </button>
                </Tooltip>
                <Tooltip label="Настройки">
                  <button
                    type="button"
                    aria-label={`Настройки ${adapter.label}`}
                    className={iconButtonClass("default")}
                    disabled={providerPending}
                    onClick={() => {
                      setMessage(initialActionState);
                      setCredentialProvider(null);
                      setSmokeTestProvider(null);
                      setSettingsProvider(adapter);
                    }}
                  >
                    <Settings className="size-4" />
                  </button>
                </Tooltip>
                <Tooltip
                  label={
                    !state.hasCredentials
                      ? "Сначала настройте авторизацию"
                      : !state.defaultModelId
                        ? "Сначала сохраните модель по умолчанию"
                        : "Проверить модель"
                  }
                >
                  <button
                    type="button"
                    aria-label={`Проверить модель ${adapter.label}`}
                    className={iconButtonClass("default")}
                    disabled={providerPending || !state.hasCredentials || !state.defaultModelId}
                    onClick={() => {
                      setMessage(initialActionState);
                      setCredentialProvider(null);
                      setSettingsProvider(null);
                      setSmokeTestProvider(adapter);
                    }}
                  >
                    <MessageSquareText className="size-4" />
                  </button>
                </Tooltip>
                <div className="ml-1 border-l border-stone-200 pl-3">
                  <Tooltip
                    label={
                      !state.enabled && !state.hasCredentials
                        ? "Сначала настройте авторизацию"
                        : state.enabled ? "Выключить провайдера" : "Включить провайдера"
                    }
                  >
                    <button
                      type="button"
                      aria-label={`${state.enabled ? "Выключить" : "Включить"} ${adapter.label}`}
                      className={iconButtonClass(state.enabled ? "enabled" : "default")}
                      disabled={providerPending || (!state.enabled && !state.hasCredentials)}
                      onClick={() => {
                        const enabled = !state.enabled;
                        setPendingCode(adapter.code);
                        setMessage(initialActionState);
                        startTransition(async () => {
                          const result = await toggleAiProviderAction(adapter.code, enabled);
                          setMessage(result);
                          if (!result.error) {
                            setProviderStates((current) => updateProviderState(
                              current,
                              adapter.code,
                              { enabled },
                            ));
                          }
                          setPendingCode(null);
                        });
                      }}
                    >
                      {state.enabled ? <Power className="size-4" /> : <PowerOff className="size-4" />}
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {credentialProvider ? (
        <CredentialsModal
          provider={credentialProvider}
          hasCredentials={providerStates.get(credentialProvider.code)?.hasCredentials ?? false}
          onClose={() => setCredentialProvider(null)}
          onSaved={() => {
            setProviderStates((current) => updateProviderState(
              current,
              credentialProvider.code,
              { hasCredentials: true, keyHint: null },
            ));
            setMessage({ error: null, success: "Авторизация настроена." });
            setCredentialProvider(null);
            router.refresh();
          }}
        />
      ) : null}

      {settingsProvider ? (
        <SettingsModal
          provider={settingsProvider}
          settings={providers.find(({ adapter }) => adapter.code === settingsProvider.code)?.settings}
          hasCredentials={providerStates.get(settingsProvider.code)?.hasCredentials ?? false}
          onClose={() => setSettingsProvider(null)}
          onSaved={(defaultModelId) => {
            setProviderStates((current) => updateProviderState(
              current,
              settingsProvider.code,
              { defaultModelId },
            ));
            setMessage({ error: null, success: "Настройки сохранены." });
            setSettingsProvider(null);
            router.refresh();
          }}
        />
      ) : null}

      {smokeTestProvider ? (
        <SmokeTestModal
          provider={smokeTestProvider}
          onClose={() => setSmokeTestProvider(null)}
        />
      ) : null}
    </div>
  );
}

function CredentialsModal({
  hasCredentials,
  onClose,
  onSaved,
  provider,
}: {
  hasCredentials: boolean;
  onClose: () => void;
  onSaved: () => void;
  provider: ProviderView;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const [state, setState] = useState(initialActionState);
  const [isPending, startTransition] = useTransition();

  return (
    <ModalFrame
      title={`Авторизация · ${provider.label}`}
      description="Данные будут проверены и зашифрованы перед записью в базу."
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
    >
      <AdminToasts messages={getActionToasts(state, "credentials")} />
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveAiProviderCredentialsAction(formData);
            setState(result);
            if (!result.error) onSaved();
          });
        }}
      >
        <input type="hidden" name="providerCode" value={provider.code} />
        {provider.credentialFields.map((field) => (
          <div key={field.key} className="grid gap-2">
            <Label htmlFor={`${formId}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${formId}-${field.key}`}
              name={`credential.${field.key}`}
              type="password"
              autoComplete="off"
              required={field.required}
              disabled={isPending}
              placeholder={hasCredentials ? "Введите новое значение для замены" : undefined}
            />
          </div>
        ))}
        {hasCredentials ? (
          <p className="text-xs text-stone-500">Сохранённые данные не отображаются. Ввод новых значений заменит их.</p>
        ) : null}
      </form>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Отмена</Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            const form = document.getElementById(formId) as HTMLFormElement | null;
            const formData = form ? new FormData(form) : new FormData();
            startTransition(async () => setState(await testAiProviderAction(formData)));
          }}
        >
          Проверить подключение
        </Button>
        <Button type="submit" form={formId} disabled={isPending}>
          <Save />
          Сохранить
        </Button>
      </div>
    </ModalFrame>
  );
}

function SettingsModal({
  hasCredentials,
  onClose,
  onSaved,
  provider,
  settings,
}: {
  hasCredentials: boolean;
  onClose: () => void;
  onSaved: (defaultModelId: string | null) => void;
  provider: ProviderView;
  settings?: ProviderSettings;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelId, setModelId] = useState(settings?.defaultModelId ?? "");
  const [modelFilter, setModelFilter] = useState<"all" | "paid" | "free">("all");
  const [state, setState] = useState(initialActionState);
  const [isPending, startTransition] = useTransition();
  const filteredModels = models.filter((model) =>
    modelFilter === "all" ||
    (modelFilter === "free" ? model.isFree === true : model.isFree === false));

  return (
    <ModalFrame
      title={`Настройки · ${provider.label}`}
      description="Модель и параметры применяются ко всем сценариям, которые используют настройки провайдера."
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
      closeDisabled={isPending}
      wide
    >
      <AdminToasts messages={getActionToasts(state, "settings")} />
      <form
        id={formId}
        className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveAiProviderSettingsAction(formData);
            setState(result);
            if (!result.error) {
              const model = formData.get("defaultModelId");
              onSaved(typeof model === "string" && model.trim() ? model.trim() : null);
            }
          });
        }}
      >
        <input type="hidden" name="providerCode" value={provider.code} />
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-model`}>Модель по умолчанию</Label>
          <Input
            id={`${formId}-model`}
            name="defaultModelId"
            value={modelId}
            onChange={(event) => setModelId(event.currentTarget.value)}
            placeholder="provider/model-id"
            disabled={isPending}
          />
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_2.5rem]">
            <Select
              aria-label="Каталог моделей"
              className="min-w-0 flex-1"
              value={filteredModels.some((model) => model.id === modelId) ? modelId : ""}
              disabled={isPending || models.length === 0}
              onChange={(event) => setModelId(event.currentTarget.value)}
            >
              <option value="">
                {models.length > 0 ? "Выберите модель из каталога" : "Каталог не загружен"}
              </option>
              {filteredModels.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </Select>
            <Select
              aria-label="Фильтр моделей по стоимости"
              className="min-w-0"
              value={modelFilter}
              disabled={isPending}
              onChange={(event) =>
                setModelFilter(event.currentTarget.value as "all" | "paid" | "free")}
            >
              <option value="all">Все модели</option>
              <option value="paid">Только платные</option>
              <option value="free">Только бесплатные</option>
            </Select>
            <Tooltip
              label="Обновить список моделей"
              className="w-fit [&_[role=tooltip]]:left-0 [&_[role=tooltip]]:translate-x-0 sm:[&_[role=tooltip]]:left-auto sm:[&_[role=tooltip]]:right-0"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Обновить список моделей"
                disabled={isPending || !hasCredentials}
                onClick={() => startTransition(async () => {
                  const result = await listAiModelsAction(provider.code);
                  setModels(result.models);
                  setState({
                    error: result.error,
                    success: result.error ? null : "Каталог моделей обновлён.",
                  });
                })}
              >
                <RefreshCw className={isPending ? "animate-spin" : undefined} />
              </Button>
            </Tooltip>
          </div>
          <p className="text-xs text-stone-500">
            {hasCredentials
              ? "Идентификатор модели всегда можно ввести вручную."
              : "Для загрузки каталога сначала настройте авторизацию. Идентификатор можно ввести вручную."}
          </p>
        </div>
        {provider.settingFields.map((field) => (
          <div key={field.key} className="grid gap-2">
            {field.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  name={`setting.${field.key}`}
                  type="checkbox"
                  value="1"
                  defaultChecked={Boolean(settings?.settings[field.key] ?? field.defaultValue)}
                  disabled={isPending}
                />
                {field.label}
              </label>
            ) : (
              <>
                <Label htmlFor={`${formId}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`${formId}-${field.key}`}
                  name={`setting.${field.key}`}
                  type={field.type === "number" ? "number" : "text"}
                  min={field.min}
                  max={field.max}
                  step={field.type === "number" ? field.step ?? "any" : undefined}
                  defaultValue={String(settings?.settings[field.key] ?? field.defaultValue ?? "")}
                  disabled={isPending}
                />
              </>
            )}
          </div>
        ))}
      </form>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Отмена</Button>
        <Button type="submit" form={formId} disabled={isPending}><Save />Сохранить</Button>
      </div>
    </ModalFrame>
  );
}

function SmokeTestModal({
  onClose,
  provider,
}: {
  onClose: () => void;
  provider: ProviderView;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [state, setState] = useState<AiProviderActionState>(initialActionState);
  const [isPending, startTransition] = useTransition();
  const canSubmit = Boolean(prompt.trim()) && prompt.length <= 8_000 && !isPending;

  return (
    <ModalFrame
      title={`Проверка модели · ${provider.label}`}
      description="Отправляет один ручной запрос через сохранённую модель и настройки провайдера."
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
      closeDisabled={isPending}
      wide
    >
      <AdminToasts messages={getActionToasts(state, "smoke-test")} />
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setState(initialActionState);
          setResponse(null);
          startTransition(async () => {
            const result = await smokeTestAiProviderModelAction(provider.code, prompt);
            setState({ error: result.error, success: null });
            setResponse(result.text);
          });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={`smoke-test-${provider.code}`}>Запрос</Label>
          <Textarea
            id={`smoke-test-${provider.code}`}
            value={prompt}
            maxLength={8_000}
            disabled={isPending}
            placeholder="Напишите короткий тестовый запрос"
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <p className="text-right text-xs text-stone-500">{prompt.length} / 8000</p>
        </div>
        {response !== null ? (
          <div className="grid gap-2">
            <div className="text-sm font-medium text-stone-700">Ответ</div>
            <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-900">
              {response}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Закрыть
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            <MessageSquareText />
            {isPending ? "Отправляем…" : "Отправить"}
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  closeDisabled = false,
  description,
  descriptionId,
  onClose,
  title,
  titleId,
  wide = false,
}: {
  children: React.ReactNode;
  closeDisabled?: boolean;
  description: string;
  descriptionId: string;
  onClose: () => void;
  title: string;
  titleId: string;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-3 py-4 sm:px-4 sm:py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Закрыть окно"
        disabled={closeDisabled}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "relative grid max-h-full w-full gap-5 overflow-y-auto rounded-lg border border-stone-200 bg-white p-4 text-stone-950 shadow-xl sm:p-5",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
            aria-label="Закрыть"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const focusableSelector = [
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getActionToasts(state: AiProviderActionState, scope: string) {
  return [
    ...(state.success
      ? [{ id: `${scope}-success`, tone: "success" as const, text: state.success }]
      : []),
    ...(state.error
      ? [{ id: `${scope}-error`, tone: "error" as const, text: state.error }]
      : []),
  ] satisfies AdminToast[];
}

function iconButtonClass(tone: "default" | "enabled" | "ready" | "warning") {
  return cn(
    "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
    tone === "enabled" && "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    tone === "ready" && "border-stone-300 bg-white text-stone-700 hover:bg-stone-100",
    tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    tone === "default" && "border-stone-200 bg-white text-stone-400 hover:bg-stone-100 hover:text-stone-700",
  );
}

function updateProviderState(
  states: Map<string, ProviderUiState>,
  providerCode: string,
  update: Partial<ProviderUiState>,
) {
  const next = new Map(states);
  const current = next.get(providerCode) ?? {
    enabled: false,
    hasCredentials: false,
    keyHint: null,
    defaultModelId: null,
  };
  next.set(providerCode, { ...current, ...update });
  return next;
}

type ProviderUiState = {
  defaultModelId: string | null;
  enabled: boolean;
  hasCredentials: boolean;
  keyHint: string | null;
};
