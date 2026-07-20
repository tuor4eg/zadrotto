import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getEmailOutboxKey() {
  const secret = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY?.trim();

  if (!secret) {
    throw new Error("EMAIL_OUTBOX_ENCRYPTION_KEY is not set");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptEmailOutboxPayload(payload: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEmailOutboxKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptEmailOutboxPayload(encryptedPayload: string) {
  const [version, ivValue, authTagValue, encryptedValue] = encryptedPayload.split(".");

  if (version !== VERSION || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Invalid email outbox payload");
  }

  const decipher = createDecipheriv(ALGORITHM, getEmailOutboxKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
}
