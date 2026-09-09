import "server-only"

import { eq } from "drizzle-orm"

import { listAdminUserIds } from "@/db/queries/admin-users"
import { insertNotifications } from "@/db/queries/notifications"
import type { DomainEventConsumer } from "@/lib/domain-events/registry"
import { resolveNotificationDraft } from "@/lib/notifications/draft"
import {
  notificationTransportOutbox,
  notificationTransportRoutes,
  notificationTransportSettings,
} from "@/db/schema"
import { getNotificationRecipientType } from "@/lib/notifications/catalog"
import { getExternalNotificationRoute, normalizeExternalTransportCodes } from "@/lib/notifications/routes"
import { MISSING_NOTIFICATION_RECIPIENT, TELEGRAM_TRANSPORT_CODE } from "@/lib/notifications/transports/catalog"
import { normalizeTelegramChatIds } from "@/lib/notifications/transports/telegram"

function isManualBugReportCreated(event: Parameters<DomainEventConsumer["handle"]>[1]) {
  return event.type === "bug-report.created" && event.actorAuthorId === null
}

export const notificationDomainEventConsumer: DomainEventConsumer = {
  key: "notifications.create",
  eventTypes: [
    "media.submitted",
    "media.approved",
    "franchise.submitted",
    "franchise.approved",
    "media-franchise.submitted",
    "media-franchise.approved",
    "media-franchise.removal.requested",
    "media-franchise.removal.approved",
    "review.submitted",
    "review.approved",
    "bug-report.created",
  ],
  async handle(tx, event) {
    if (isManualBugReportCreated(event)) return
    const draft = await resolveNotificationDraft(tx, event)
    if (!draft) return

    const recipientType = getNotificationRecipientType(draft.type)
    const recipientIds = recipientType === "admin"
      ? await listAdminUserIds(tx)
      : Number.isInteger(draft.authorId) && draft.authorId > 0
        ? [draft.authorId]
        : []

    if (recipientIds.length === 0) return

    await insertNotifications(
      tx,
      recipientIds.map((recipientId) => ({
        body: draft.body,
        entityId: draft.entityId,
        entityType: draft.entityType,
        recipientId,
        recipientType,
        title: draft.title,
        type: draft.type,
      })),
    )
    const route = getExternalNotificationRoute(draft.type)
    if (!route) return
    const [routeRow] = await tx.select({ transportCodes: notificationTransportRoutes.transportCodes })
      .from(notificationTransportRoutes)
      .where(eq(notificationTransportRoutes.code, route.code))
      .limit(1)
    const transportCodes = normalizeExternalTransportCodes(routeRow?.transportCodes) ?? []
    if (!transportCodes.includes(TELEGRAM_TRANSPORT_CODE)) return

    const [settings] = await tx.select({ chatIds: notificationTransportSettings.chatIds })
      .from(notificationTransportSettings)
      .where(eq(notificationTransportSettings.code, TELEGRAM_TRANSPORT_CODE))
      .limit(1)
    const chatIds = normalizeTelegramChatIds(settings?.chatIds) ?? []
    await tx.insert(notificationTransportOutbox)
      .values((chatIds.length > 0 ? chatIds : [MISSING_NOTIFICATION_RECIPIENT]).map((recipient) => ({
        eventId: event.id,
        recipient,
        transport: TELEGRAM_TRANSPORT_CODE,
      })))
      .onConflictDoNothing()
  },
}
