import { eq } from "drizzle-orm"

import { db } from "@/db"
import { adminActivityLogs, notificationTransportSettings } from "@/db/schema"
import type { CreateActivityLogInput } from "@/db/queries/activity-logs"
import { TELEGRAM_TRANSPORT_CODE } from "@/lib/notifications/transports/catalog"
import {
  canUseNotificationTransportEncryption,
  decryptNotificationTransportCredentials,
  encryptNotificationTransportCredentials,
  getNotificationTransportCredentialHint,
} from "@/lib/notifications/transports/credential-crypto"
import type {
  TelegramTransportAdminState,
  TelegramTransportConfig,
} from "@/lib/notifications/transports/telegram"

function asChatIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function getTelegramTransportAdminState(): Promise<TelegramTransportAdminState> {
  const [row] = await db
    .select({
      enabled: notificationTransportSettings.enabled,
      encryptedPayload: notificationTransportSettings.encryptedPayload,
      keyHint: notificationTransportSettings.keyHint,
      chatIds: notificationTransportSettings.chatIds,
    })
    .from(notificationTransportSettings)
    .where(eq(notificationTransportSettings.code, TELEGRAM_TRANSPORT_CODE))
    .limit(1)

  return {
    enabled: row?.enabled ?? false,
    hasBotToken: Boolean(row?.encryptedPayload),
    botTokenHint: row?.keyHint ?? null,
    chatIds: asChatIds(row?.chatIds),
  }
}

export async function getTelegramTransportConfig(): Promise<TelegramTransportConfig> {
  const [row] = await db
    .select({
      enabled: notificationTransportSettings.enabled,
      encryptedPayload: notificationTransportSettings.encryptedPayload,
      chatIds: notificationTransportSettings.chatIds,
    })
    .from(notificationTransportSettings)
    .where(eq(notificationTransportSettings.code, TELEGRAM_TRANSPORT_CODE))
    .limit(1)

  const credentials = row?.encryptedPayload
    ? decryptNotificationTransportCredentials(row.encryptedPayload)
    : null
  const botToken = credentials?.botToken?.trim() || null

  return {
    enabled: row?.enabled ?? false,
    botToken,
    chatIds: asChatIds(row?.chatIds),
  }
}

export async function saveTelegramTransportSettings(input: {
  adminId: number
  enabled: boolean
  botToken: string | null
  chatIds: string[]
  activityLogs: [CreateActivityLogInput, ...CreateActivityLogInput[]]
}) {
  const [current] = await db
    .select({
      encryptedPayload: notificationTransportSettings.encryptedPayload,
      keyHint: notificationTransportSettings.keyHint,
    })
    .from(notificationTransportSettings)
    .where(eq(notificationTransportSettings.code, TELEGRAM_TRANSPORT_CODE))
    .limit(1)

  let encryptedPayload = current?.encryptedPayload ?? null
  let keyHint = current?.keyHint ?? null

  if (input.botToken) {
    if (!canUseNotificationTransportEncryption()) return false
    const encrypted = encryptNotificationTransportCredentials({ botToken: input.botToken })
    if (!encrypted) return false
    encryptedPayload = encrypted
    keyHint = getNotificationTransportCredentialHint(input.botToken)
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(notificationTransportSettings)
      .values({
        code: TELEGRAM_TRANSPORT_CODE,
        enabled: input.enabled,
        encryptedPayload,
        keyHint,
        chatIds: input.chatIds,
        updatedByAdminId: input.adminId,
      })
      .onConflictDoUpdate({
        target: notificationTransportSettings.code,
        set: {
          enabled: input.enabled,
          encryptedPayload,
          keyHint,
          chatIds: input.chatIds,
          updatedByAdminId: input.adminId,
          updatedAt: new Date(),
        },
      })
    await tx.insert(adminActivityLogs).values(input.activityLogs)
  })

  return true
}
