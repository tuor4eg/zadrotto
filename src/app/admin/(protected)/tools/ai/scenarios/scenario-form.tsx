"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import type { AiFieldDefinition } from "@/lib/ai/types";
import { getAiScenarioDefinition } from "@/lib/ai/scenarios/catalog";

export type ScenarioFormProvider = {
  code: string;
  label: string;
  settingFields: readonly AiFieldDefinition[];
  defaultModelId: string | null;
  settings: Record<string, unknown>;
  legacy?: boolean;
};

type ScenarioProfile = {
  id: number;
  key: string;
  name: string;
  providerCode: string;
  modelId: string | null;
  instruction: string | null;
  parameters: Record<string, unknown>;
  config: Record<string, unknown>;
  enabled: boolean;
};

export function ScenarioForm({
  action,
  catalogEntries = [],
  profile,
  providers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  catalogEntries?: { key: string; name: string }[];
  profile?: ScenarioProfile;
  providers: ScenarioFormProvider[];
  submitLabel: string;
}) {
  const initialProvider = providers.find((item) => item.code === profile?.providerCode) ??
    providers[0];
  const [providerCode, setProviderCode] = useState(initialProvider?.code ?? "");
  const provider = providers.find((item) => item.code === providerCode) ?? initialProvider;
  const [parameters, setParameters] = useState<Record<string, unknown>>(
    profile?.parameters ?? {},
  );
  const [modelId, setModelId] = useState(profile?.modelId ?? "");
  const definition = getAiScenarioDefinition(profile?.key ?? "suggest_series");
  const [instruction, setInstruction] = useState(profile?.instruction ?? "");
  const [resultLimit, setResultLimit] = useState(
    String(profile?.config.resultLimit ?? definition?.defaultConfig.resultLimit ?? 3),
  );
  const hasExistingOverrides = Boolean(
    profile?.modelId || profile?.instruction ||
    (profile && Object.keys(profile.parameters).length > 0) ||
    (profile && Object.keys(profile.config).length > 0),
  );
  const [detailsOpen, setDetailsOpen] = useState(hasExistingOverrides);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  if (!provider) return null;

  return (
    <form
      action={action}
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        const errors = validateScenarioForm(new FormData(event.currentTarget), provider);
        if (Object.keys(errors).length === 0) return;
        event.preventDefault();
        setFieldErrors(errors);
        if (Object.keys(errors).some((key) => key.startsWith("parameter."))) {
          setDetailsOpen(true);
        }
      }}
    >
      {profile ? <input type="hidden" name="id" value={profile.id} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="scenario-key">Назначение</Label>
        {profile ? (
          <>
            <Input id="scenario-key" value={definition?.name ?? profile.name} disabled />
            <p className="text-xs text-stone-500">Технический ключ: {profile.key}</p>
          </>
        ) : (
          <Select id="scenario-key" name="scenarioKey" defaultValue={catalogEntries[0]?.key}>
            {catalogEntries.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.name}</option>
            ))}
          </Select>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="scenario-provider">Провайдер</Label>
        <Select
          id="scenario-provider"
          name="providerCode"
          value={providerCode}
          onChange={(event) => {
            setProviderCode(event.currentTarget.value);
            setParameters({});
            setModelId("");
            setFieldErrors((current) => Object.fromEntries(
              Object.entries(current).filter(([key]) => !key.startsWith("parameter.")),
            ));
          }}
        >
          {providers.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}{item.legacy ? " (недоступен)" : ""}
            </option>
          ))}
        </Select>
        {provider.legacy ? (
          <p className="text-xs text-amber-700">
            Этот провайдер больше не зарегистрирован. Выберите доступный провайдер,
            чтобы сохранить сценарий.
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="scenario-instruction">Инструкция</Label>
        <Textarea
          id="scenario-instruction"
          name="instruction"
          value={instruction}
          maxLength={8000}
          placeholder={definition?.defaultInstruction}
          onChange={(event) => setInstruction(event.currentTarget.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setInstruction("")}
        >
          Сбросить к системной
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="scenario-result-limit">Количество предложений</Label>
        <Input
          id="scenario-result-limit"
          name="resultLimit"
          type="number"
          min={1}
          max={10}
          step={1}
          value={resultLimit}
          aria-invalid={Boolean(fieldErrors.resultLimit)}
          aria-describedby={
            fieldErrors.resultLimit ? "scenario-result-limit-error" : undefined
          }
          className={fieldErrors.resultLimit ? "border-red-400" : undefined}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setResultLimit(value);
            updateFieldError(setFieldErrors, "resultLimit", validateResultLimit(value));
          }}
        />
        {fieldErrors.resultLimit ? (
          <FieldError id="scenario-result-limit-error">{fieldErrors.resultLimit}</FieldError>
        ) : null}
      </div>
      <details
        className="rounded-md border border-stone-200 bg-stone-50/50 p-4"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-stone-900">
          Дополнительно
        </summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="scenario-model">Модель</Label>
            <Input
              id="scenario-model"
              name="modelId"
              value={modelId}
              onChange={(event) => setModelId(event.currentTarget.value)}
              placeholder={provider.defaultModelId ?? "provider/model-id"}
            />
            <p className="text-xs text-stone-500">
              Оставьте пустым, чтобы использовать модель провайдера
              {provider.defaultModelId ? `: ${provider.defaultModelId}` : "."}
            </p>
          </div>
          {provider.settingFields.map((field) => (
            <div key={`${provider.code}-${field.key}`} className="grid gap-2">
              <Label htmlFor={`scenario-parameter-${field.key}`}>{field.label}</Label>
              {field.type === "boolean" ? (
                <Select
                  id={`scenario-parameter-${field.key}`}
                  name={`parameter.${field.key}`}
                  value={
                    parameters[field.key] === true
                      ? "1"
                      : parameters[field.key] === false ? "0" : ""
                  }
                  onChange={(event) => setParameters((current) => {
                    const next = { ...current };
                    if (event.currentTarget.value === "") delete next[field.key];
                    else next[field.key] = event.currentTarget.value === "1";
                    return next;
                  })}
                >
                  <option value="">Из настроек провайдера</option>
                  <option value="1">Да</option>
                  <option value="0">Нет</option>
                </Select>
              ) : (
                <Input
                  id={`scenario-parameter-${field.key}`}
                  name={`parameter.${field.key}`}
                  type={field.type === "number" ? "number" : "text"}
                  min={field.min}
                  max={field.max}
                  step={field.type === "number" ? field.step ?? "any" : undefined}
                  aria-invalid={Boolean(fieldErrors[`parameter.${field.key}`])}
                  aria-describedby={
                    fieldErrors[`parameter.${field.key}`]
                      ? `scenario-parameter-${field.key}-error`
                      : undefined
                  }
                  className={fieldErrors[`parameter.${field.key}`] ? "border-red-400" : undefined}
                  value={String(parameters[field.key] ?? "")}
                  placeholder={
                    provider.settings[field.key] === undefined
                      ? "Из настроек провайдера"
                      : String(provider.settings[field.key])
                  }
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setParameters((current) => ({ ...current, [field.key]: value }));
                    updateFieldError(
                      setFieldErrors,
                      `parameter.${field.key}`,
                      validateScenarioParameter(field, value),
                    );
                  }}
                />
              )}
              {fieldErrors[`parameter.${field.key}`] ? (
                <FieldError id={`scenario-parameter-${field.key}-error`}>
                  {fieldErrors[`parameter.${field.key}`]}
                </FieldError>
              ) : null}
            </div>
          ))}
        </div>
      </details>
      <div>
        <Button type="submit" disabled={provider.legacy || hasFieldErrors}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function validateScenarioForm(formData: FormData, provider: ScenarioFormProvider) {
  const errors: Record<string, string> = {};
  const resultLimitError = validateResultLimit(String(formData.get("resultLimit") ?? ""));
  if (resultLimitError) errors.resultLimit = resultLimitError;
  for (const field of provider.settingFields) {
    if (field.type === "boolean") continue;
    const error = validateScenarioParameter(
      field,
      String(formData.get(`parameter.${field.key}`) ?? ""),
    );
    if (error) errors[`parameter.${field.key}`] = error;
  }
  return errors;
}

function validateResultLimit(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10
    ? null
    : "Укажите целое число от 1 до 10.";
}

function validateScenarioParameter(field: AiFieldDefinition, value: string) {
  if (!value.trim() || field.type !== "number") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return `Поле «${field.label}» должно быть числом.`;
  if (field.min !== undefined && number < field.min) {
    return `Минимальное значение поля «${field.label}» — ${field.min}.`;
  }
  if (field.max !== undefined && number > field.max) {
    return `Максимальное значение поля «${field.label}» — ${field.max}.`;
  }
  if (typeof field.step === "number") {
    const base = field.min ?? 0;
    const steps = (number - base) / field.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return `Значение поля «${field.label}» должно изменяться с шагом ${field.step}.`;
    }
  }
  return null;
}

function updateFieldError(
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  key: string,
  error: string | null,
) {
  setErrors((current) => {
    const next = { ...current };
    if (error) next[key] = error;
    else delete next[key];
    return next;
  });
}

function FieldError({ children, id }: { children: React.ReactNode; id: string }) {
  return <p id={id} role="alert" className="text-xs text-red-700">{children}</p>;
}
