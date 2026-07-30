"use server";

import { redirect } from "next/navigation";

import {
  createAiScenarioProfile,
  deleteAiScenarioProfile,
  getAiScenarioProfileById,
  setAiScenarioEnabled,
  updateAiScenarioProfile,
} from "@/db/queries/ai-scenarios";
import { getAiProviderRuntimeConfig } from "@/db/queries/ai-providers";
import { logActivity, prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { decryptAiCredentials } from "@/lib/ai/credential-crypto";
import { aiProviderRegistry } from "@/lib/ai/registry";
import {
  getAiProviderSettingFields,
  parseAiCredentials,
  parseAiParameters,
  readSparseAiFieldsFromForm,
} from "@/lib/ai/schema";
import {
  getAiScenarioDefinition,
  parseSuggestSeriesConfig,
} from "@/lib/ai/scenarios/catalog";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseScenarioInput(
  formData: FormData,
  identity: { key: string; name: string },
  enabled: boolean,
) {
  const providerCode = read(formData, "providerCode");
  const adapter = aiProviderRegistry.get(providerCode);
  const fields = getAiProviderSettingFields(adapter.settingFields);
  const instruction = read(formData, "instruction") || null;
  if (instruction && instruction.length > 8_000) {
    throw new Error("INVALID_AI_SCENARIO_INSTRUCTION");
  }
  const input = {
    ...identity,
    providerCode,
    modelId: read(formData, "modelId") || null,
    parameters: parseAiParameters(
      readSparseAiFieldsFromForm(formData, "parameter.", fields),
      fields,
      { allowMissingRequired: true },
    ),
    instruction,
    config: parseSuggestSeriesConfig({
      resultLimit: Number(read(formData, "resultLimit")),
    }),
    enabled,
  };
  return input;
}

async function assertScenarioCredentialsReady(
  input: { providerCode: string; enabled: boolean },
) {
  if (!input.enabled) return;
  const adapter = aiProviderRegistry.get(input.providerCode);
  const current = await getAiProviderRuntimeConfig(input.providerCode);
  const credentials = current.credentials
    ? decryptAiCredentials(current.credentials.encryptedPayload)
    : null;
  parseAiCredentials(credentials, adapter.credentialFields);
}

export async function createAiScenarioAction(formData: FormData) {
  const admin = await requireAdminUser();
  let input: ReturnType<typeof parseScenarioInput> | null = null;
  try {
    const definition = getAiScenarioDefinition(read(formData, "scenarioKey"));
    if (!definition) throw new Error("UNKNOWN_AI_SCENARIO");
    input = parseScenarioInput(formData, definition, false);
    await assertScenarioCredentialsReady(input);
    await createAiScenarioProfile({
      ...input,
      adminId: admin.id,
      activityLog: await prepareActivityLog({
        action: "ai-scenario.created",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "ai-scenario",
        entityLabel: input.name,
        message: "AI-сценарий создан.",
        metadata: scenarioMetadata(input),
      }),
    });
  } catch {
    await logScenarioFailure({
      action: "ai-scenario.created",
      adminId: admin.id,
      input,
      formData,
      message: "AI-сценарий не создан.",
    });
    redirect("/admin/tools/ai/scenarios/new?error=invalid");
  }
  redirect("/admin/tools/ai/scenarios?created=1");
}

export async function updateAiScenarioAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = Number(read(formData, "id"));
  if (!Number.isInteger(id) || id <= 0) {
    redirect("/admin/tools/ai/scenarios?error=not-found");
  }
  let input: ReturnType<typeof parseScenarioInput> | null = null;
  try {
    const existing = await getAiScenarioProfileById(id);
    if (!existing) throw new Error("AI_SCENARIO_NOT_FOUND");
    const definition = getAiScenarioDefinition(existing.key);
    if (!definition) throw new Error("UNKNOWN_AI_SCENARIO");
    input = parseScenarioInput(formData, definition, existing.enabled);
    await assertScenarioCredentialsReady(input);
    await updateAiScenarioProfile({
      ...input,
      id,
      adminId: admin.id,
      activityLog: await prepareActivityLog({
        action: "ai-scenario.updated",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "ai-scenario",
        entityId: id,
        entityLabel: input.name,
        message: "AI-сценарий изменён.",
        metadata: scenarioMetadata(input),
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_SCENARIO_NOT_FOUND") {
      redirect("/admin/tools/ai/scenarios?error=not-found");
    }
    await logScenarioFailure({
      action: "ai-scenario.updated",
      adminId: admin.id,
      entityId: id,
      input,
      formData,
      message: "AI-сценарий не сохранён.",
    });
    redirect(`/admin/tools/ai/scenarios/${id}/edit?error=invalid`);
  }
  redirect(`/admin/tools/ai/scenarios/${id}/edit?updated=1`);
}

export async function deleteAiScenarioAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = Number(read(formData, "id"));
  if (!Number.isInteger(id) || id <= 0) {
    redirect("/admin/tools/ai/scenarios?error=not-found");
  }
  const existing = await getAiScenarioProfileById(id);
  if (!existing) redirect("/admin/tools/ai/scenarios?error=not-found");
  try {
    await deleteAiScenarioProfile({
      id,
      activityLog: await prepareActivityLog({
        action: "ai-scenario.deleted",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "ai-scenario",
        entityId: id,
        entityLabel: existing.name,
        message: "AI-сценарий удалён.",
        metadata: { key: existing.key },
      }),
    });
  } catch {
    redirect("/admin/tools/ai/scenarios?error=delete");
  }
  redirect("/admin/tools/ai/scenarios?deleted=1");
}

export type AiScenarioToggleState = {
  error: string | null;
  success: string | null;
};

export async function toggleAiScenarioAction(
  id: number,
  enabled: boolean,
): Promise<AiScenarioToggleState> {
  const admin = await requireAdminUser();
  try {
    if (!Number.isInteger(id) || id <= 0 || typeof enabled !== "boolean") {
      throw new Error("INVALID_AI_SCENARIO");
    }
    const profile = await getAiScenarioProfileById(id);
    if (!profile || !getAiScenarioDefinition(profile.key)) {
      throw new Error("AI_SCENARIO_NOT_FOUND");
    }
    await assertScenarioCredentialsReady({
      providerCode: profile.providerCode,
      enabled,
    });
    await setAiScenarioEnabled({
      id,
      enabled,
      adminId: admin.id,
      activityLog: await prepareActivityLog({
        action: "ai-scenario.updated",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "ai-scenario",
        entityId: id,
        entityLabel: getAiScenarioDefinition(profile.key)!.name,
        message: enabled ? "AI-сценарий включён." : "AI-сценарий выключен.",
        metadata: { key: profile.key, enabled },
      }),
    });
    return {
      error: null,
      success: enabled ? "Сценарий включён." : "Сценарий выключен.",
    };
  } catch {
    return {
      error: enabled
        ? "Не удалось включить сценарий. Проверь настройки провайдера и модели."
        : "Не удалось выключить сценарий.",
      success: null,
    };
  }
}

function scenarioMetadata(input: ReturnType<typeof parseScenarioInput>) {
  return {
    key: input.key,
    providerCode: input.providerCode,
    modelId: input.modelId,
    enabled: input.enabled,
    parameterKeys: Object.keys(input.parameters),
  };
}

async function logScenarioFailure(input: {
  action: "ai-scenario.created" | "ai-scenario.updated";
  adminId: number;
  entityId?: number;
  formData: FormData;
  input: ReturnType<typeof parseScenarioInput> | null;
  message: string;
}) {
  await logActivity({
    action: input.action,
    actorType: "admin",
    adminUserId: input.adminId,
    entityType: "ai-scenario",
    entityId: input.entityId ?? null,
    entityLabel: input.input?.name || read(input.formData, "name") ||
      read(input.formData, "key") || null,
    status: "failure",
    message: input.message,
    metadata: {
      key: input.input?.key || read(input.formData, "key"),
      providerCode: input.input?.providerCode || read(input.formData, "providerCode"),
      reason: "invalid-conflict-or-provider-not-ready",
    },
  });
}
