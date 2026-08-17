import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { contributions, franchises, mediaItems, notifications } from "@/db/schema"
import type { DbTransaction } from "@/db/transaction"
import {
  getNotificationHref,
  isNotificationType,
  parseMediaFranchiseEntityId,
  parsePositiveInt,
  type NotificationRecipientType,
  type NotificationType,
} from "@/lib/notifications/catalog"

const DEFAULT_NOTIFICATION_LIST_LIMIT = 20

export type NotificationInsert = {
  body: string
  entityId: string
  entityType: string
  recipientId: number
  recipientType: NotificationRecipientType
  title: string
  type: NotificationType
}

export type NotificationListItem = {
  body: string
  createdAt: Date
  href: string | null
  id: number
  readAt: Date | null
  title: string
  type: NotificationType
}

export async function insertNotifications(tx: DbTransaction, rows: NotificationInsert[]) {
  if (rows.length === 0) return
  await tx.insert(notifications).values(rows)
}

export async function listRecipientNotifications(input: {
  limit?: number
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_NOTIFICATION_LIST_LIMIT, 50))
  const rows = await db
    .select({
      body: notifications.body,
      createdAt: notifications.createdAt,
      entityId: notifications.entityId,
      id: notifications.id,
      readAt: notifications.readAt,
      title: notifications.title,
      type: notifications.type,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientType, input.recipientType),
        eq(notifications.recipientId, input.recipientId),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)

  const mediaItemIds = new Set<number>()
  const franchiseIds = new Set<number>()
  const reviewIds = new Set<number>()

  for (const row of rows) {
    if (!isNotificationType(row.type)) continue
    if (row.type === "franchise.approved") {
      const franchiseId = parsePositiveInt(row.entityId)
      if (franchiseId) franchiseIds.add(franchiseId)
      continue
    }
    if (row.type === "review.approved") {
      const contributionId = parsePositiveInt(row.entityId)
      if (contributionId) reviewIds.add(contributionId)
      continue
    }
    const mediaFranchise = parseMediaFranchiseEntityId(row.entityId)
    if (mediaFranchise && (row.type === "media-franchise.approved" || row.type === "media-franchise.removal.approved")) {
      mediaItemIds.add(mediaFranchise.mediaItemId)
      continue
    }
    if (row.type === "media.approved") {
      const mediaItemId = parsePositiveInt(row.entityId)
      if (mediaItemId) mediaItemIds.add(mediaItemId)
    }
  }

  const [mediaItemRows, franchiseRows, reviewRows] = await Promise.all([
    mediaItemIds.size > 0
      ? db
          .select({ code: mediaItems.code, id: mediaItems.id })
          .from(mediaItems)
          .where(inArray(mediaItems.id, [...mediaItemIds]))
      : Promise.resolve([]),
    franchiseIds.size > 0
      ? db
          .select({ code: franchises.code, id: franchises.id })
          .from(franchises)
          .where(inArray(franchises.id, [...franchiseIds]))
      : Promise.resolve([]),
    reviewIds.size > 0
      ? db
          .select({
            code: mediaItems.code,
            contributionId: contributions.id,
          })
          .from(contributions)
          .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
          .where(inArray(contributions.id, [...reviewIds]))
      : Promise.resolve([]),
  ])

  const mediaItemCodeById = new Map(mediaItemRows.map((row) => [row.id, row.code]))
  const franchiseCodeById = new Map(franchiseRows.map((row) => [row.id, row.code]))
  const reviewCodeByContributionId = new Map(reviewRows.map((row) => [row.contributionId, row.code]))

  const items: NotificationListItem[] = []
  for (const row of rows) {
    if (!isNotificationType(row.type)) continue
    const mediaFranchise = parseMediaFranchiseEntityId(row.entityId)
    const entityId = parsePositiveInt(row.entityId)
    const mediaItemCode = row.type === "review.approved"
      ? reviewCodeByContributionId.get(entityId ?? 0) ?? null
      : mediaFranchise
        ? mediaItemCodeById.get(mediaFranchise.mediaItemId) ?? null
        : mediaItemCodeById.get(entityId ?? 0) ?? null
    const franchiseCode = franchiseCodeById.get(entityId ?? 0) ?? null
    items.push({
      body: row.body,
      createdAt: row.createdAt,
      href: getNotificationHref({
        entityId: row.entityId,
        franchiseCode,
        mediaItemCode,
        type: row.type,
      }),
      id: row.id,
      readAt: row.readAt,
      title: row.title,
      type: row.type,
    })
  }

  return items
}

export async function getUnreadNotificationCount(input: {
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  const [row] = await db
    .select({
      count: sql<number>`count(${notifications.id})::int`,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientType, input.recipientType),
        eq(notifications.recipientId, input.recipientId),
        isNull(notifications.readAt),
      ),
    )

  return row?.count ?? 0
}

export async function markNotificationRead(input: {
  notificationId: number
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, input.notificationId),
        eq(notifications.recipientType, input.recipientType),
        eq(notifications.recipientId, input.recipientId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id })

  return row ?? null
}
