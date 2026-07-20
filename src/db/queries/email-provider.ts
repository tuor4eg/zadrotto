import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, emailDeliverySettings, emailOutbox } from "@/db/schema";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import { decryptEmailProviderApiKey, encryptEmailProviderApiKey } from "@/lib/auth/email-provider-crypto";
import { getSiteOrigin } from "@/lib/site-url";
import { validateResendEmailConfig } from "@/lib/auth/email-provider";

export async function getResendEmailStatus() {
  const [row] = await db.select({ enabled: emailDeliverySettings.enabled, encryptedApiKey: emailDeliverySettings.encryptedApiKey, keyHint: emailDeliverySettings.apiKeyHint, updatedAt: emailDeliverySettings.updatedAt })
    .from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const status = !row ? "missing" : !row.enabled ? "disabled" : !decryptEmailProviderApiKey(row.encryptedApiKey) ? "decrypt-error" : "ready";
  return { status, keyHint: row?.keyHint ?? null, updatedAt: row?.updatedAt ?? null } as const;
}

export async function getResendEmailDeliveryReadiness() {
  const config = await getResendEmailConfig();
  if (!config?.enabled) return null;
  try {
    return { config, siteOrigin: getSiteOrigin() };
  } catch {
    return null;
  }
}

export async function setEmailDeliveryEnabled(input: {
  enabled: boolean;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(emailDeliverySettings).set({ enabled: input.enabled, updatedByAdminId: input.adminId, updatedAt: new Date() })
      .where(eq(emailDeliverySettings.id, 1)).returning({ id: emailDeliverySettings.id });
    if (!row) return false;
    await tx.insert(adminActivityLogs).values(input.activityLog);
    return true;
  });
}

export async function getResendEmailConfig() {
  const [row] = await db.select().from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const apiKey = row ? decryptEmailProviderApiKey(row.encryptedApiKey) : null;
  return row && apiKey ? validateResendEmailConfig({ apiKey, fromName: row.fromName, fromEmail: row.fromEmail, replyTo: row.replyTo ?? undefined, enabled: row.enabled }) : null;
}

export async function saveResendEmailConfig(input: {
  adminId: number;
  apiKey: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  enabled: boolean;
  activityLogs: [CreateActivityLogInput, ...CreateActivityLogInput[]];
}) {
  const encryptedApiKey = encryptEmailProviderApiKey(input.apiKey);
  if (!encryptedApiKey) return false;
  await db.transaction(async (tx) => {
    await tx.insert(emailDeliverySettings).values({
      id: 1,
      provider: "resend",
      encryptedApiKey,
      apiKeyHint: `••••${input.apiKey.slice(-4)}`,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      replyTo: input.replyTo,
      enabled: input.enabled,
      updatedByAdminId: input.adminId,
    }).onConflictDoUpdate({
      target: emailDeliverySettings.id,
      set: { encryptedApiKey, apiKeyHint: `••••${input.apiKey.slice(-4)}`, fromName: input.fromName, fromEmail: input.fromEmail, replyTo: input.replyTo, enabled: input.enabled, updatedByAdminId: input.adminId, updatedAt: new Date() },
    });
    await tx.insert(adminActivityLogs).values(input.activityLogs);
  });
  return true;
}

export async function getEmailOutboxCounts() {
  const [counts] = await db.select({
    pending: sql<number>`count(*) filter (where ${emailOutbox.status} in ('pending', 'sending'))::int`,
    failed: sql<number>`count(*) filter (where ${emailOutbox.status} = 'failed')::int`,
  }).from(emailOutbox);
  return counts;
}
