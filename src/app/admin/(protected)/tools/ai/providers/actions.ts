"use server";

import {
  getAiProviderRuntimeConfig,
  saveAiProviderCredentials,
  saveAiProviderSettings,
  setAiProviderEnabled,
} from "@/db/queries/ai-providers";
import { createAiCallLog } from "@/db/queries/ai-call-logs";
import { prepareActivityLog, logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { decryptAiCredentials, encryptAiCredentials, getAiCredentialHint } from "@/lib/ai/credential-crypto";
import { aiProviderRegistry } from "@/lib/ai/registry";
import { getAiProviderSettingFields, parseAiCredentials, parseAiParameters, readAiFieldsFromForm } from "@/lib/ai/schema";
import { normalizeAiError } from "@/lib/ai/service";
import { runAiWithTimeout } from "@/lib/ai/timeout";
import { AiError, type AiParameters } from "@/lib/ai/types";

const PROVIDER_SMOKE_TEST_PROFILE_KEY = "__admin-provider-smoke-test__";
const MAX_SMOKE_TEST_PROMPT_LENGTH = 8_000;
const MAX_SMOKE_TEST_RESPONSE_LENGTH = 20_000;
const MAX_SMOKE_TEST_OUTPUT_TOKENS = 1_024;

export type AiProviderActionState = {
  error: string | null;
  success: string | null;
};

function codeFrom(formData: FormData) {
  const code = formData.get("providerCode");
  return typeof code === "string" ? code.trim() : "";
}

export async function saveAiProviderCredentialsAction(
  formData: FormData,
): Promise<AiProviderActionState> {
  const admin = await requireAdminUser();
  const providerCode = codeFrom(formData);
  try {
    const adapter = aiProviderRegistry.get(providerCode);
    const enteredCredentials = readAiFieldsFromForm(formData, "credential.", adapter.credentialFields);
    const credentials = parseAiCredentials(enteredCredentials, adapter.credentialFields);
    await runAiWithTimeout(15_000, (signal) =>
      adapter.validateCredentials({ credentials, signal }));
    const encryptedPayload = encryptAiCredentials(credentials);
    if (!encryptedPayload) throw new Error("ENCRYPTION_UNAVAILABLE");
    const activityLog = await prepareActivityLog({
      action: "ai-provider.credentials.updated", actorType: "admin",
      adminUserId: admin.id, entityType: "ai-provider", entityLabel: adapter.label,
      message: "Данные авторизации AI-провайдера проверены и сохранены.",
      metadata: { providerCode },
    });
    await saveAiProviderCredentials({
      providerCode,
      encryptedPayload,
      keyHint: getAiCredentialHint(credentials),
      adminId: admin.id,
      activityLog,
    });
    return { error: null, success: "Авторизация настроена." };
  } catch {
    await logActivity({
      action: "ai-provider.credentials.updated", actorType: "admin", adminUserId: admin.id,
      entityType: "ai-provider", entityLabel: providerCode, status: "failure",
      message: "Данные авторизации AI-провайдера не сохранены.",
      metadata: { providerCode, reason: "invalid-or-unavailable" },
    });
    return { error: "Не удалось проверить и сохранить данные авторизации.", success: null };
  }
}

export async function saveAiProviderSettingsAction(
  formData: FormData,
): Promise<AiProviderActionState> {
  const admin = await requireAdminUser();
  const providerCode = codeFrom(formData);
  try {
    const adapter = aiProviderRegistry.get(providerCode);
    const settingFields = getAiProviderSettingFields(adapter.settingFields);
    const settings = parseAiParameters(readAiFieldsFromForm(formData, "setting.", settingFields), settingFields, {
      applyDefaults: true,
    });
    const model = formData.get("defaultModelId");
    const defaultModelId = typeof model === "string" && model.trim() ? model.trim() : null;
    const activityLog = await prepareActivityLog({
      action: "ai-provider.settings.updated", actorType: "admin",
      adminUserId: admin.id, entityType: "ai-provider", entityLabel: adapter.label,
      message: "Настройки AI-провайдера сохранены.",
      metadata: { providerCode, modelId: defaultModelId, settingKeys: Object.keys(settings) },
    });
    await saveAiProviderSettings({
      providerCode, defaultModelId, settings, adminId: admin.id, activityLog,
    });
    return { error: null, success: "Настройки сохранены." };
  } catch (error) {
    await logActivity({
      action: "ai-provider.settings.updated", actorType: "admin", adminUserId: admin.id,
      entityType: "ai-provider", entityLabel: providerCode, status: "failure",
      message: "Настройки AI-провайдера не сохранены.",
      metadata: { providerCode, reason: "invalid-or-unavailable" },
    });
    return {
      error: error instanceof Error && error.message === "AI_PROVIDER_DEFAULT_MODEL_REQUIRED"
        ? "Нельзя убрать модель по умолчанию: её используют включённые сценарии."
        : "Не удалось сохранить настройки.",
      success: null,
    };
  }
}

export async function toggleAiProviderAction(
  providerCode: string,
  enabled: boolean,
): Promise<AiProviderActionState> {
  const admin = await requireAdminUser();
  try {
    const adapter = aiProviderRegistry.get(providerCode);
    const current = await getAiProviderRuntimeConfig(providerCode);
    if (enabled && !current.credentials) {
      return { error: "Сначала настройте авторизацию.", success: null };
    }
    if (enabled && current.credentials) {
      const decrypted = decryptAiCredentials(current.credentials.encryptedPayload);
      parseAiCredentials(decrypted, adapter.credentialFields);
    }
    const activityLog = await prepareActivityLog({
      action: "ai-provider.settings.updated", actorType: "admin",
      adminUserId: admin.id, entityType: "ai-provider", entityLabel: adapter.label,
      message: enabled ? "AI-провайдер включён." : "AI-провайдер выключен.",
      metadata: { providerCode, enabled },
    });
    await setAiProviderEnabled({ providerCode, enabled, adminId: admin.id, activityLog });
    return { error: null, success: enabled ? "Провайдер включён." : "Провайдер выключен." };
  } catch {
    return {
      error: enabled
        ? "Не удалось прочитать данные авторизации. Настройте их заново."
        : "Не удалось изменить состояние провайдера.",
      success: null,
    };
  }
}

export async function testAiProviderAction(
  formData: FormData,
): Promise<AiProviderActionState> {
  const admin = await requireAdminUser();
  const providerCode = codeFrom(formData);
  let ok = false;
  try {
    const adapter = aiProviderRegistry.get(providerCode);
    const current = await getAiProviderRuntimeConfig(providerCode);
    const entered = readAiFieldsFromForm(formData, "credential.", adapter.credentialFields);
    const raw = Object.keys(entered).length
      ? entered
      : current.credentials && decryptAiCredentials(current.credentials.encryptedPayload);
    const credentials = parseAiCredentials(raw, adapter.credentialFields);
    await runAiWithTimeout(15_000, (signal) =>
      adapter.validateCredentials({ credentials, signal }));
    ok = true;
  } catch {}
  await logActivity({
    action: "ai-provider.tested", actorType: "admin", adminUserId: admin.id,
    entityType: "ai-provider", entityLabel: providerCode, status: ok ? "success" : "failure",
    message: ok ? "Подключение к AI-провайдеру проверено." : "Проверка AI-провайдера завершилась ошибкой.",
    metadata: { providerCode },
  });
  return ok
    ? { error: null, success: "Подключение работает." }
    : { error: "Не удалось подключиться к провайдеру.", success: null };
}

export async function listAiModelsAction(providerCode: string) {
  await requireAdminUser();
  try {
    const adapter = aiProviderRegistry.get(providerCode);
    if (!adapter.listModels) return { models: [], error: null };
    const current = await getAiProviderRuntimeConfig(providerCode);
    const raw = current.credentials
      ? decryptAiCredentials(current.credentials.encryptedPayload)
      : null;
    const credentials = parseAiCredentials(raw, adapter.credentialFields);
    const models = await runAiWithTimeout(15_000, (signal) =>
      adapter.listModels!({ credentials, signal }));
    return {
      models: models.map(({ id, label, isFree }) => ({ id, label, isFree })),
      error: null,
    };
  } catch {
    return { models: [], error: "Не удалось обновить каталог моделей. Model ID можно ввести вручную." };
  }
}

export type AiProviderSmokeTestResult = {
  error: string | null;
  text: string | null;
};

export async function smokeTestAiProviderModelAction(
  providerCode: unknown,
  prompt: unknown,
): Promise<AiProviderSmokeTestResult> {
  await requireAdminUser();
  const startedAt = Date.now();
  let safeProviderCode = "";
  let modelId: string | null = null;
  try {
    if (typeof providerCode !== "string" || typeof prompt !== "string") {
      throw new AiError("configuration", "Некорректный тестовый запрос.");
    }
    safeProviderCode = providerCode.trim();
    const safePrompt = prompt.trim();
    if (!safePrompt || safePrompt.length > MAX_SMOKE_TEST_PROMPT_LENGTH) {
      throw new AiError("configuration", "Некорректный тестовый запрос.");
    }
    const adapter = aiProviderRegistry.get(safeProviderCode);
    const current = await getAiProviderRuntimeConfig(safeProviderCode);
    modelId = current.settings?.defaultModelId?.trim() || null;
    if (!modelId || !current.credentials || !current.settings) {
      throw new AiError("configuration", "AI-провайдер не настроен.");
    }
    const decrypted = decryptAiCredentials(current.credentials.encryptedPayload);
    const credentials = parseAiCredentials(decrypted, adapter.credentialFields);
    const fields = getAiProviderSettingFields(adapter.settingFields);
    const savedParameters = parseAiParameters(current.settings.settings, fields, {
      applyDefaults: true,
    });
    const parameters: AiParameters = {
      ...savedParameters,
      maxOutputTokens: Math.min(
        typeof savedParameters.maxOutputTokens === "number"
          ? savedParameters.maxOutputTokens
          : MAX_SMOKE_TEST_OUTPUT_TOKENS,
        MAX_SMOKE_TEST_OUTPUT_TOKENS,
      ),
    };
    const timeoutMs = typeof parameters.timeoutMs === "number"
      ? parameters.timeoutMs
      : 30_000;
    const result = await runAiWithTimeout(timeoutMs, (signal) =>
      adapter.generateText({
        messages: [{ role: "user", content: safePrompt }],
        modelId: modelId!,
        parameters,
      }, { credentials, signal }));
    await writeSmokeTestLog({
      providerCode: safeProviderCode,
      modelId: result.modelId,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage: result.usage,
      providerRequestId: result.providerRequestId,
    });
    return {
      error: null,
      text: result.text.slice(0, MAX_SMOKE_TEST_RESPONSE_LENGTH),
    };
  } catch (error) {
    const normalized = normalizeAiError(error);
    await writeSmokeTestLog({
      providerCode: safeProviderCode || null,
      modelId,
      status: "failure",
      latencyMs: Date.now() - startedAt,
      errorCode: normalized.code,
    });
    return { error: getSmokeTestErrorMessage(normalized.code), text: null };
  }
}

async function writeSmokeTestLog(
  input: Omit<Parameters<typeof createAiCallLog>[0], "scenarioProfileId" | "profileKey">,
) {
  try {
    await createAiCallLog({
      ...input,
      scenarioProfileId: null,
      profileKey: PROVIDER_SMOKE_TEST_PROFILE_KEY,
    });
  } catch (error) {
    console.error("Failed to write AI provider smoke test log", error);
  }
}

function getSmokeTestErrorMessage(code: string) {
  switch (code) {
    case "authentication":
      return "Провайдер отклонил данные авторизации.";
    case "rate-limit":
      return "Лимит запросов провайдера исчерпан.";
    case "timeout":
      return "Провайдер не ответил вовремя.";
    case "configuration":
      return "Сначала сохраните модель, настройки и данные авторизации.";
    default:
      return "Не удалось получить ответ от провайдера.";
  }
}
