import "server-only"

import { listAdminUserIds } from "@/db/queries/admin-users"
import { insertNotifications } from "@/db/queries/notifications"
import type { DomainEventConsumer } from "@/lib/domain-events/registry"
import { resolveNotificationDraft } from "@/lib/notifications/draft"
import { dispatchExternalNotificationTransports } from "@/lib/notifications/external"
import { getNotificationRecipientType } from "@/lib/notifications/catalog"

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
  ],
  async handle(tx, event) {
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
  },
  async afterCommit(event) {
    await dispatchExternalNotificationTransports(event)
  },
}
