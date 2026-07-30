import { AiError, type AiCredentials, type AiFieldDefinition, type AiParameters } from "./types";

function parseFields(
  value: unknown,
  fields: readonly AiFieldDefinition[],
  credentials: boolean,
  applyDefaults: boolean,
  allowMissingRequired: boolean,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiError("configuration", "Настройки AI-провайдера имеют неверный формат.");
  }

  const source = value as Record<string, unknown>;
  const allowed = new Set(fields.map((field) => field.key));
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new AiError("configuration", "Настройки AI-провайдера содержат неизвестные поля.");
  }

  const result: AiParameters = {};
  for (const field of fields) {
    const raw = source[field.key] ?? (applyDefaults ? field.defaultValue : undefined);
    if (raw === undefined || raw === null || raw === "") {
      if (field.required && !allowMissingRequired) {
        throw new AiError("configuration", `Поле «${field.label}» обязательно.`);
      }
      continue;
    }

    if (credentials || field.type === "string" || field.type === "secret") {
      if (typeof raw !== "string" || !raw.trim()) {
        throw new AiError("configuration", `Поле «${field.label}» должно быть строкой.`);
      }
      result[field.key] = raw.trim();
    } else if (field.type === "number") {
      const number = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) ||
          (field.max !== undefined && number > field.max)) {
        throw new AiError("configuration", `Поле «${field.label}» вне допустимого диапазона.`);
      }
      if (typeof field.step === "number") {
        const steps = (number - (field.min ?? 0)) / field.step;
        const tolerance = Number.EPSILON * 100 * Math.max(1, Math.abs(steps));
        if (Math.abs(steps - Math.round(steps)) > tolerance) {
          throw new AiError("configuration", `Поле «${field.label}» не соответствует допустимому шагу.`);
        }
      }
      result[field.key] = number;
    } else {
      if (typeof raw !== "boolean") {
        throw new AiError("configuration", `Поле «${field.label}» должно быть логическим.`);
      }
      result[field.key] = raw;
    }
  }
  return result;
}

export function parseAiCredentials(value: unknown, fields: readonly AiFieldDefinition[]) {
  return parseFields(value, fields, true, false, false) as AiCredentials;
}

export function parseAiParameters(
  value: unknown,
  fields: readonly AiFieldDefinition[],
  options?: { applyDefaults?: boolean; allowMissingRequired?: boolean },
) {
  return parseFields(
    value,
    fields,
    false,
    options?.applyDefaults ?? false,
    options?.allowMissingRequired ?? false,
  );
}

export const COMMON_AI_SETTING_FIELDS = [
  { key: "temperature", label: "Температура", type: "number", min: 0, max: 2, step: 0.1 },
  {
    key: "maxOutputTokens",
    label: "Максимум токенов ответа",
    type: "number",
    min: 1,
    max: 1_000_000,
  },
  {
    key: "timeoutMs",
    label: "Таймаут, мс",
    type: "number",
    defaultValue: 30_000,
    min: 1_000,
    max: 300_000,
  },
] as const satisfies readonly AiFieldDefinition[];

export function getAiProviderSettingFields(specific: readonly AiFieldDefinition[]) {
  const fields = [...COMMON_AI_SETTING_FIELDS, ...specific];
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) {
      throw new Error(`Duplicate AI setting field: ${field.key}`);
    }
    keys.add(field.key);
  }
  return fields;
}

export function readAiFieldsFromForm(
  formData: FormData,
  prefix: string,
  fields: readonly AiFieldDefinition[],
) {
  const result: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = formData.get(`${prefix}${field.key}`);
    if (field.type === "boolean") {
      result[field.key] = value === "1";
    } else if (typeof value === "string" && value.trim()) {
      result[field.key] = value.trim();
    }
  }
  return result;
}

export function readSparseAiFieldsFromForm(
  formData: FormData,
  prefix: string,
  fields: readonly AiFieldDefinition[],
) {
  const result: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = formData.get(`${prefix}${field.key}`);
    if (field.type === "boolean") {
      if (value === "1") result[field.key] = true;
      if (value === "0") result[field.key] = false;
    } else if (typeof value === "string" && value.trim()) {
      result[field.key] = value.trim();
    }
  }
  return result;
}
