import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { authProviderSettings, authorAuthIdentities, providerCredentials } from "@/db/schema";
import { isAuthProviderCode } from "@/lib/auth/external/provider-definitions";
import { canUseProviderCredentialEncryption, decryptProviderCredentials, encryptProviderCredentials } from "@/lib/providers/credential-crypto";

const credentialWhere = (code: string) => and(eq(providerCredentials.purpose, "auth"), eq(providerCredentials.providerCode, code));

export async function getAuthProviderConfiguration(code: string): Promise<{
  enabled: boolean;
  credentials: { clientId: string; clientSecret: string } | null;
  revision: string;
}> {
  if (!isAuthProviderCode(code)) return { enabled: false, credentials: null, revision: "unconfigured" };
  // One joined statement gives an atomic view of settings and credentials.
  const [row] = await db.select({ settings: authProviderSettings, credentials: providerCredentials })
    .from(authProviderSettings).leftJoin(providerCredentials, credentialWhere(code))
    .where(eq(authProviderSettings.providerCode, code)).limit(1);
  const values = row?.credentials ? decryptProviderCredentials(row.credentials.encryptedPayload, { purpose: "auth", providerCode: code }) : null;
  return {
    enabled: row?.settings.enabled ?? false,
    credentials: values?.clientId && values.clientSecret ? { clientId: values.clientId, clientSecret: values.clientSecret } : null,
    revision: row?.settings.revision ?? "unconfigured",
  };
}

export async function getAuthProviderAdminSettings(code: string) {
  const configuration = await getAuthProviderConfiguration(code);
  return { enabled: configuration.enabled, clientId: configuration.credentials?.clientId ?? "", hasSecret: Boolean(configuration.credentials?.clientSecret) };
}

export async function saveAuthProviderSettings(input: {
  providerCode: string; adminId: number; enabled: boolean; clientId: string; clientSecret: string;
}) {
  if (!isAuthProviderCode(input.providerCode)) return { error: "Неизвестный провайдер." };
  const code = input.providerCode;
  return db.transaction(async (tx) => {
    await tx.insert(authProviderSettings).values({ providerCode: code }).onConflictDoNothing();
    await tx.select().from(authProviderSettings).where(eq(authProviderSettings.providerCode, code)).for("update");
    const [stored] = await tx.select().from(providerCredentials).where(credentialWhere(code)).limit(1);
    const previous = stored ? decryptProviderCredentials(stored.encryptedPayload, { purpose: "auth", providerCode: code }) : null;
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim() || previous?.clientSecret || "";
    // Disabling remains possible when credentials are absent or the master key is unavailable.
    if (!input.enabled && ((!previous && stored) || !clientId || !clientSecret || !canUseProviderCredentialEncryption())) {
      await tx.update(authProviderSettings).set({ enabled: false, revision: randomUUID(), updatedByAdminId: input.adminId, updatedAt: new Date() }).where(eq(authProviderSettings.providerCode, code));
      return { error: null };
    }
    if (stored && !previous) return { error: "Не удалось прочитать сохранённые данные. Проверьте ключ шифрования." };
    if (previous?.clientId && previous.clientId !== clientId) {
      const [identity] = await tx.select({ id: authorAuthIdentities.id }).from(authorAuthIdentities).where(eq(authorAuthIdentities.provider, code)).limit(1);
      if (identity) return { error: "Client ID нельзя менять, пока есть связанные аккаунты." };
    }
    if (!clientId || !clientSecret || clientId.length > 1024 || clientSecret.length > 4096) return { error: "Укажите корректные Client ID и Client Secret." };
    const encryptedPayload = encryptProviderCredentials({ clientId, clientSecret }, { purpose: "auth", providerCode: code });
    if (!encryptedPayload) return { error: "Не настроен ключ шифрования данных провайдеров." };
    const now = new Date();
    await tx.insert(providerCredentials).values({ purpose: "auth", providerCode: code, encryptedPayload, keyHint: "••••", updatedByAdminId: input.adminId, updatedAt: now })
      .onConflictDoUpdate({ target: [providerCredentials.purpose, providerCredentials.providerCode], set: { encryptedPayload, keyHint: "••••", updatedByAdminId: input.adminId, updatedAt: now } });
    await tx.update(authProviderSettings).set({ enabled: input.enabled, revision: randomUUID(), updatedByAdminId: input.adminId, updatedAt: now }).where(eq(authProviderSettings.providerCode, code));
    return { error: null };
  });
}
