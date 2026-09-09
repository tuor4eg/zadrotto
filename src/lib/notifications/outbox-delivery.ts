import { eq } from "drizzle-orm"

import { db } from "@/db"
import { domainEvents } from "@/db/schema"
import {
  claimPendingNotificationTransportMessages,
  completeNotificationTransportMessage,
  enqueueNotificationTransportRecipients,
} from "@/db/queries/notification-transport-outbox"
import { getTelegramTransportConfig } from "@/db/queries/notification-transports"
import { getEnabledExternalTransportCodes } from "@/db/queries/notification-transport-routes"
import { isDomainEventType, type PersistedDomainEvent } from "@/lib/domain-events/catalog"
import { dispatchExternalNotificationTransport } from "@/lib/notifications/external"
import { isNotificationType } from "@/lib/notifications/catalog"
import { MISSING_NOTIFICATION_RECIPIENT } from "@/lib/notifications/transports/catalog"
import {
  NOTIFICATION_TRANSPORT_MAX_ATTEMPTS,
  processClaimedNotificationTransportMessages,
} from "@/lib/notifications/outbox-policy"

const BATCH_SIZE = 20

type ClaimedMessage = Awaited<ReturnType<typeof claimPendingNotificationTransportMessages>>[number]

async function sendClaimedMessage(message: ClaimedMessage, signal?: AbortSignal) {
  const [event] = await db.select().from(domainEvents).where(eq(domainEvents.id, message.eventId)).limit(1)
  if (!event || !isDomainEventType(event.type)) throw new Error("Domain event is missing or unsupported.")
  if (message.recipient === MISSING_NOTIFICATION_RECIPIENT) {
    if (!isNotificationType(event.type)) throw new Error("Domain event is not a notification event.")
    const transportCodes = await getEnabledExternalTransportCodes(event.type)
    if (!transportCodes.includes("telegram")) return
    const config = await getTelegramTransportConfig()
    if (!config.enabled || !config.botToken || config.chatIds.length === 0) {
      throw new Error("Telegram transport configuration is not ready.")
    }
    await enqueueNotificationTransportRecipients({
      eventId: message.eventId, recipients: config.chatIds, transport: "telegram",
    })
    return
  }
  await dispatchExternalNotificationTransport({
    event: event as PersistedDomainEvent,
    recipient: message.recipient,
    signal,
    transport: message.transport,
  })
}

export async function deliverPendingNotificationTransports(signal?: AbortSignal) {
  const messages = await claimPendingNotificationTransportMessages(BATCH_SIZE, NOTIFICATION_TRANSPORT_MAX_ATTEMPTS)
  return processClaimedNotificationTransportMessages(messages, {
    complete: completeNotificationTransportMessage,
    send: (message) => sendClaimedMessage(message, signal),
  })
}
