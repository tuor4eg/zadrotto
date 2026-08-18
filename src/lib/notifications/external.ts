import "server-only"

import { getEnabledExternalTransportCodes } from "@/db/queries/notification-transport-routes"
import { getTelegramTransportConfig } from "@/db/queries/notification-transports"
import { db } from "@/db"
import type { PersistedDomainEvent } from "@/lib/domain-events/catalog"
import {
  getNotificationHref,
  isNotificationType,
} from "@/lib/notifications/catalog"
import { TELEGRAM_TRANSPORT_CODE } from "@/lib/notifications/transports/catalog"
import { TelegramTransport } from "@/lib/notifications/transports/telegram-api"
import { formatExternalNotificationText } from "@/lib/notifications/routes"
import { getSiteOrigin } from "@/lib/site-url"
import { resolveNotificationDraft } from "@/lib/notifications/draft"

function getSiteOriginOrNull() {
  try {
    return getSiteOrigin().origin
  } catch {
    return null
  }
}

export async function dispatchExternalNotificationTransports(event: PersistedDomainEvent) {
  if (!isNotificationType(event.type)) return

  const transportCodes = await getEnabledExternalTransportCodes(event.type)
  if (!transportCodes.includes(TELEGRAM_TRANSPORT_CODE)) return

  const draft = await db.transaction((tx) => resolveNotificationDraft(tx, event))
  if (!draft) return

  const text = formatExternalNotificationText({
    body: draft.body,
    href: getNotificationHref({
      entityId: draft.entityId,
      franchiseCode: null,
      mediaItemCode: null,
      type: draft.type,
    }),
    siteOrigin: getSiteOriginOrNull(),
    title: draft.title,
  })

  try {
    const transport = new TelegramTransport(await getTelegramTransportConfig())
    if (!transport.isReady()) return

    const results = await transport.send(text)
    const failed = results.filter((item) => !item.ok)
    if (failed.length === 0) return

    console.error("Failed to send Telegram notification", {
      type: event.type,
      failedCount: failed.length,
      errors: failed.map((item) => ({ chatId: item.chatId, error: item.error })),
    })
  } catch (error) {
    console.error("Failed to send Telegram notification", {
      type: event.type,
      errorName: error instanceof Error ? error.name : typeof error,
    })
  }
}
