import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  adminActivityLogs,
  aiProviderCredentials,
  aiProviderSettings,
  aiScenarioProfiles,
} from "@/db/schema";
import type { CreateActivityLogInput } from "./activity-logs";
import { lockAiProviderSettings } from "./ai-providers";
import type { AiScenarioCatalogKey } from "@/lib/ai/scenarios/catalog";

export async function getAiScenarioProfiles() {
  return db.select({
    id: aiScenarioProfiles.id,
    key: aiScenarioProfiles.key,
    name: aiScenarioProfiles.name,
    providerCode: aiScenarioProfiles.providerCode,
    modelId: aiScenarioProfiles.modelId,
    enabled: aiScenarioProfiles.enabled,
    updatedAt: aiScenarioProfiles.updatedAt,
  }).from(aiScenarioProfiles).orderBy(asc(aiScenarioProfiles.name));
}

export async function getAiScenarioProfileById(id: number) {
  const [profile] = await db.select().from(aiScenarioProfiles)
    .where(eq(aiScenarioProfiles.id, id)).limit(1);
  return profile ?? null;
}

export async function getEnabledAiScenarioProfile(key: string) {
  const [profile] = await db.select().from(aiScenarioProfiles)
    .where(eq(aiScenarioProfiles.key, key)).limit(1);
  return profile?.enabled ? profile : null;
}

export async function isAiScenarioEnabled(key: AiScenarioCatalogKey) {
  const [profile] = await db.select({ enabled: aiScenarioProfiles.enabled })
    .from(aiScenarioProfiles)
    .where(eq(aiScenarioProfiles.key, key))
    .limit(1);

  return profile?.enabled === true;
}

type AiScenarioProfileWrite = {
  key: string;
  name: string;
  providerCode: string;
  modelId: string | null;
  instruction: string | null;
  parameters: Record<string, unknown>;
  config: Record<string, unknown>;
  enabled: boolean;
  adminId: number;
  activityLog: CreateActivityLogInput;
};

async function assertProviderReadyForEnabledScenario(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: Pick<AiScenarioProfileWrite, "enabled" | "modelId" | "providerCode">,
) {
  if (!input.enabled) return;
  await lockAiProviderSettings(tx, input.providerCode);
  const [provider] = await tx.select({
    enabled: aiProviderSettings.enabled,
    defaultModelId: aiProviderSettings.defaultModelId,
  })
    .from(aiProviderSettings)
    .where(eq(aiProviderSettings.providerCode, input.providerCode)).limit(1);
  const [credentials] = await tx.select({ providerCode: aiProviderCredentials.providerCode })
    .from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.providerCode, input.providerCode)).limit(1);
  const effectiveModelId = input.modelId?.trim() || provider?.defaultModelId?.trim() || null;
  if (!provider?.enabled || !credentials || !effectiveModelId) {
    throw new Error("AI_SCENARIO_PROVIDER_NOT_READY");
  }
}

export async function createAiScenarioProfile(input: AiScenarioProfileWrite) {
  await db.transaction(async (tx) => {
    const modelId = input.modelId?.trim() || null;
    await assertProviderReadyForEnabledScenario(tx, { ...input, modelId });
    await tx.insert(aiScenarioProfiles).values({
      key: input.key,
      name: input.name,
      providerCode: input.providerCode,
      modelId,
      instruction: input.instruction,
      parameters: input.parameters,
      config: input.config,
      enabled: input.enabled,
      updatedByAdminId: input.adminId,
      updatedAt: new Date(),
    });
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}

export async function updateAiScenarioProfile(input: AiScenarioProfileWrite & { id: number }) {
  await db.transaction(async (tx) => {
    const modelId = input.modelId?.trim() || null;
    await assertProviderReadyForEnabledScenario(tx, { ...input, modelId });
    const [updated] = await tx.update(aiScenarioProfiles).set({
      key: input.key,
      name: input.name,
      providerCode: input.providerCode,
      modelId,
      instruction: input.instruction,
      parameters: input.parameters,
      config: input.config,
      enabled: input.enabled,
      updatedByAdminId: input.adminId,
      updatedAt: new Date(),
    }).where(eq(aiScenarioProfiles.id, input.id))
      .returning({ id: aiScenarioProfiles.id });
    if (!updated) throw new Error("AI_SCENARIO_NOT_FOUND");
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}

export async function deleteAiScenarioProfile(input: {
  id: number;
  activityLog: CreateActivityLogInput;
}) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(aiScenarioProfiles)
      .where(eq(aiScenarioProfiles.id, input.id))
      .returning({ id: aiScenarioProfiles.id });
    if (!deleted) throw new Error("AI_SCENARIO_NOT_FOUND");
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}

export async function setAiScenarioEnabled(input: {
  id: number;
  enabled: boolean;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  await db.transaction(async (tx) => {
    const [profile] = await tx.select({
      providerCode: aiScenarioProfiles.providerCode,
      modelId: aiScenarioProfiles.modelId,
    }).from(aiScenarioProfiles)
      .where(eq(aiScenarioProfiles.id, input.id))
      .limit(1);
    if (!profile) throw new Error("AI_SCENARIO_NOT_FOUND");
    await assertProviderReadyForEnabledScenario(tx, {
      enabled: input.enabled,
      providerCode: profile.providerCode,
      modelId: profile.modelId,
    });
    await tx.update(aiScenarioProfiles).set({
      enabled: input.enabled,
      updatedByAdminId: input.adminId,
      updatedAt: new Date(),
    }).where(eq(aiScenarioProfiles.id, input.id));
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}
