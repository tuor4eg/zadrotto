import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailDeliverySettings, emailOutbox } from "@/db/schema";
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

export async function setEmailDeliveryEnabled(enabled: boolean, adminId: number) {
  const [row] = await db.update(emailDeliverySettings).set({ enabled, updatedByAdminId: adminId, updatedAt: new Date() })
    .where(eq(emailDeliverySettings.id, 1)).returning({ id: emailDeliverySettings.id });
  return Boolean(row);
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
}) {
  const encryptedApiKey = encryptEmailProviderApiKey(input.apiKey);
  if (!encryptedApiKey) return false;
  await db.insert(emailDeliverySettings).values({
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
  return true;
}

export async function getEmailOutboxCounts() {
  const rows = await db.select({ status: emailOutbox.status }).from(emailOutbox);
  return {
    pending: rows.filter(({ status }) => status === "pending" || status === "sending").length,
    failed: rows.filter(({ status }) => status === "failed").length,
  };
}

export async function retryFailedEmailOutbox() {
  const rows = await db.update(emailOutbox).set({ status: "pending", nextAttemptAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(emailOutbox.status, "failed")).returning({ id: emailOutbox.id });
  return rows.length;
}
