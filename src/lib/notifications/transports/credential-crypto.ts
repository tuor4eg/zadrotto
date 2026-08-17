import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const VERSION = "v1"

function getKey() {
  const secret = process.env.NOTIFICATION_TRANSPORT_CREDENTIALS_KEY?.trim()
  return secret && secret.length >= 32 ? createHash("sha256").update(secret).digest() : null
}

export function canUseNotificationTransportEncryption() {
  return Boolean(getKey())
}

export function encryptNotificationTransportCredentials(credentials: Record<string, string>) {
  const key = getKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ])
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")].join(".")
}

export function decryptNotificationTransportCredentials(payload: string) {
  const key = getKey()
  if (!key) return null
  const [version, iv, tag, encrypted] = payload.split(".")
  if (version !== VERSION || !iv || !tag || !encrypted) return null
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed)
    return entries.every(([, value]) => typeof value === "string")
      ? Object.fromEntries(entries) as Record<string, string>
      : null
  } catch {
    return null
  }
}

export function getNotificationTransportCredentialHint(value: string) {
  const token = value.trim()
  return token ? `••••${token.slice(-4)}` : null
}
