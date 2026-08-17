import "server-only"

import { and, eq } from "drizzle-orm"

import { listAdminUserIds } from "@/db/queries/admin-users"
import { insertNotifications } from "@/db/queries/notifications"
import {
  contributionReviews,
  contributions,
  franchises,
  mediaItems,
} from "@/db/schema"
import type { DbTransaction } from "@/db/transaction"
import type { DomainEventConsumer } from "@/lib/domain-events/registry"
import {
  getMediaFranchiseEntityId,
  getNotificationEntityType,
  getNotificationRecipientType,
  getNotificationTitle,
  isNotificationType,
} from "@/lib/notifications/catalog"

async function getMediaItemTitle(tx: DbTransaction, mediaItemId: number) {
  const [item] = await tx
    .select({ title: mediaItems.title })
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaItemId))
    .limit(1)
  return item?.title ?? null
}

async function getFranchiseTitle(tx: DbTransaction, franchiseId: number) {
  const [franchise] = await tx
    .select({ title: franchises.title })
    .from(franchises)
    .where(eq(franchises.id, franchiseId))
    .limit(1)
  return franchise?.title ?? null
}

async function getMediaFranchiseBody(
  tx: DbTransaction,
  mediaItemId: number,
  franchiseId: number,
) {
  const [mediaTitle, franchiseTitle] = await Promise.all([
    getMediaItemTitle(tx, mediaItemId),
    getFranchiseTitle(tx, franchiseId),
  ])
  if (!mediaTitle || !franchiseTitle) return null
  return `${mediaTitle} → ${franchiseTitle}`
}

async function getReviewTitle(tx: DbTransaction, contributionId: number) {
  const [review] = await tx
    .select({ title: contributionReviews.title })
    .from(contributionReviews)
    .innerJoin(contributions, eq(contributions.id, contributionReviews.contributionId))
    .where(and(eq(contributions.id, contributionId), eq(contributions.type, "review")))
    .limit(1)
  return review?.title ?? null
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
  ],
  async handle(tx, event) {
    if (!isNotificationType(event.type)) return
    const type = event.type

    let body: string | null = null
    let entityId: string | null = null
    let authorId = 0

    if (event.type === "media.submitted" || event.type === "media.approved") {
      const payload = event.payload as { authorId: number; mediaItemId: number }
      body = await getMediaItemTitle(tx, payload.mediaItemId)
      entityId = String(payload.mediaItemId)
      authorId = payload.authorId
    } else if (event.type === "franchise.submitted" || event.type === "franchise.approved") {
      const payload = event.payload as { authorId: number; franchiseId: number }
      body = await getFranchiseTitle(tx, payload.franchiseId)
      entityId = String(payload.franchiseId)
      authorId = payload.authorId
    } else if (
      event.type === "media-franchise.submitted"
      || event.type === "media-franchise.approved"
      || event.type === "media-franchise.removal.requested"
      || event.type === "media-franchise.removal.approved"
    ) {
      const payload = event.payload as { authorId: number; franchiseId: number; mediaItemId: number }
      body = await getMediaFranchiseBody(tx, payload.mediaItemId, payload.franchiseId)
      entityId = getMediaFranchiseEntityId(payload.mediaItemId, payload.franchiseId)
      authorId = payload.authorId
    } else {
      const payload = event.payload as { authorId: number; contributionId: number; mediaItemId: number }
      body = await getReviewTitle(tx, payload.contributionId)
      entityId = String(payload.contributionId)
      authorId = payload.authorId
    }

    if (!body || !entityId) return

    const recipientType = getNotificationRecipientType(type)
    const recipientIds = recipientType === "admin"
      ? await listAdminUserIds(tx)
      : Number.isInteger(authorId) && authorId > 0
        ? [authorId]
        : []

    if (recipientIds.length === 0) return

    await insertNotifications(
      tx,
      recipientIds.map((recipientId) => ({
        body,
        entityId,
        entityType: getNotificationEntityType(type),
        recipientId,
        recipientType,
        title: getNotificationTitle(type),
        type,
      })),
    )
  },
}
