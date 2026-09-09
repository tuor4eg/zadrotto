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

export async function dispatchExternalNotificationTransport(input: {
  event: PersistedDomainEvent
  recipient: string
  transport: string
  signal?: AbortSignal
}) {
  const { event } = input
  if (!isNotificationType(event.type)) throw new Error("Unsupported notification event type.")

  const transportCodes = await getEnabledExternalTransportCodes(event.type)
  if (!transportCodes.includes(TELEGRAM_TRANSPORT_CODE)) return "disabled" as const
  if (input.transport !== TELEGRAM_TRANSPORT_CODE) throw new Error("Unsupported notification transport.")

  const draft = await db.transaction((tx) => resolveNotificationDraft(tx, event))
  if (!draft) return "obsolete" as const

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

  const transport = new TelegramTransport(await getTelegramTransportConfig())
  if (!transport.isReady()) throw new Error("Telegram transport configuration is not ready.")

  const results = await transport.send(text, { recipient: input.recipient, signal: input.signal })
  const failed = results.filter((item) => !item.ok)
  if (failed.length === 0) return "delivered" as const

  throw new Error(`Telegram notification failed for ${failed.length} recipient(s): ${failed
    .map((item) => item.error)
    .join("; ")}`)
}
