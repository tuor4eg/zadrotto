import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENCODING_VERSION = "v1";

function getMasterKey() {
  const secret = process.env.COVER_PROVIDER_CREDENTIALS_KEY?.trim();

  if (!secret || secret.length < 32) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

export function canUseCoverCredentialEncryption() {
  return Boolean(getMasterKey());
}

export function encryptCoverProviderCredentials(credentials: Record<string, string>) {
  const key = getMasterKey();

  if (!key) {
    return null;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCODING_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptCoverProviderCredentials(encryptedPayload: string) {
  const key = getMasterKey();

  if (!key) {
    return null;
  }

  const [version, ivValue, authTagValue, encryptedValue] = encryptedPayload.split(".");

  if (version !== ENCODING_VERSION || !ivValue || !authTagValue || !encryptedValue) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, "base64url"), {
      authTagLength: AUTH_TAG_BYTES,
    });

    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => Boolean(value)),
    );
  } catch {
    return null;
  }
}
