import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey() {
  const secret = process.env.EMAIL_PROVIDER_CREDENTIALS_KEY?.trim();
  return secret && secret.length >= 32 ? createHash("sha256").update(secret).digest() : null;
}

export function encryptEmailProviderApiKey(apiKey: string) {
  const key = getKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptEmailProviderApiKey(payload: string) {
  const key = getKey();
  const [version, iv, tag, encrypted] = payload.split(".");
  if (!key || version !== VERSION || !iv || !tag || !encrypted) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8").trim() || null;
  } catch {
    return null;
  }
}
