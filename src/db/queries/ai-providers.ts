import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  adminActivityLogs,
  aiProviderCredentials,
  aiProviderSettings,
  aiScenarioProfiles,
} from "@/db/schema";
import type { CreateActivityLogInput } from "./activity-logs";

type AiTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockAiProviderSettings(
  tx: AiTransaction,
  providerCode: string,
) {
  await tx.execute(sql`
    select 1
    from ${aiProviderSettings}
    where ${aiProviderSettings.providerCode} = ${providerCode}
    for update
  `);
}

export async function getAiProviderAdminState() {
  const [settings, credentials] = await Promise.all([
    db.select().from(aiProviderSettings),
    db.select({
      providerCode: aiProviderCredentials.providerCode,
      keyHint: aiProviderCredentials.keyHint,
      updatedAt: aiProviderCredentials.updatedAt,
    }).from(aiProviderCredentials),
  ]);
  return { settings, credentials };
}

export async function getAiProviderScenarioDefaults() {
  return db.select({
    providerCode: aiProviderSettings.providerCode,
    defaultModelId: aiProviderSettings.defaultModelId,
    settings: aiProviderSettings.settings,
  }).from(aiProviderSettings);
}

export async function getAiProviderRuntimeConfig(providerCode: string) {
  const [settings] = await db.select().from(aiProviderSettings)
    .where(eq(aiProviderSettings.providerCode, providerCode)).limit(1);
  const [credentials] = await db.select().from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.providerCode, providerCode)).limit(1);
  return { settings: settings ?? null, credentials: credentials ?? null };
}

export async function saveAiProviderCredentials(input: {
  providerCode: string;
  encryptedPayload: string;
  keyHint: string;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(aiProviderCredentials).values({
      providerCode: input.providerCode,
      encryptedPayload: input.encryptedPayload,
      keyHint: input.keyHint,
      updatedByAdminId: input.adminId,
    }).onConflictDoUpdate({
      target: aiProviderCredentials.providerCode,
      set: {
        encryptedPayload: input.encryptedPayload,
        keyHint: input.keyHint,
        updatedByAdminId: input.adminId,
        updatedAt: new Date(),
      },
    });
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}

export async function saveAiProviderSettings(input: {
  providerCode: string;
  defaultModelId: string | null;
  settings: Record<string, unknown>;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  await db.transaction(async (tx) => {
    await lockAiProviderSettings(tx, input.providerCode);
    const defaultModelId = input.defaultModelId?.trim() || null;
    if (!defaultModelId) {
      const [dependentScenario] = await tx.select({ id: aiScenarioProfiles.id })
        .from(aiScenarioProfiles)
        .where(and(
          eq(aiScenarioProfiles.providerCode, input.providerCode),
          eq(aiScenarioProfiles.enabled, true),
          isNull(aiScenarioProfiles.modelId),
        ))
        .limit(1);
      if (dependentScenario) {
        throw new Error("AI_PROVIDER_DEFAULT_MODEL_REQUIRED");
      }
    }
    await tx.insert(aiProviderSettings).values({
      providerCode: input.providerCode,
      defaultModelId,
      settings: input.settings,
      updatedByAdminId: input.adminId,
    }).onConflictDoUpdate({
      target: aiProviderSettings.providerCode,
      set: {
        defaultModelId,
        settings: input.settings,
        updatedByAdminId: input.adminId,
        updatedAt: new Date(),
      },
    });
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}

export async function setAiProviderEnabled(input: {
  providerCode: string;
  enabled: boolean;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(aiProviderSettings).values({
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedByAdminId: input.adminId,
    }).onConflictDoUpdate({
      target: aiProviderSettings.providerCode,
      set: {
        enabled: input.enabled,
        updatedByAdminId: input.adminId,
        updatedAt: new Date(),
      },
    });
    await tx.insert(adminActivityLogs).values(input.activityLog);
  });
}
