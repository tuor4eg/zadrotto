import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  contributions,
  bugReports,
  franchises,
  mediaItemFranchiseRemovalRequests,
  mediaItemFranchises,
  mediaItems,
  notifications,
} from "@/db/schema"
import type { DbTransaction } from "@/db/transaction"
import {
  getAdminSubmissionStatusLabel,
  getNotificationHref,
  isAdminSubmissionNotificationType,
  isNotificationType,
  parseMediaFranchiseEntityId,
  parsePositiveInt,
  type NotificationRecipientType,
  type NotificationType,
} from "@/lib/notifications/catalog"

const DEFAULT_NOTIFICATION_LIST_LIMIT = 20

const notificationEntityIdIntSql = sql`case
  when ${notifications.entityId} ~ '^[0-9]+$' then ${notifications.entityId}::int
  else 0
end`

const notificationMediaFranchiseMediaIdSql = sql`case
  when ${notifications.entityId} ~ '^[0-9]+:[0-9]+$' then split_part(${notifications.entityId}, ':', 1)::int
  else 0
end`

const notificationMediaFranchiseFranchiseIdSql = sql`case
  when ${notifications.entityId} ~ '^[0-9]+:[0-9]+$' then split_part(${notifications.entityId}, ':', 2)::int
  else 0
end`

export const adminSubmissionStillOpenSql = sql`(
  case ${notifications.type}
    when 'media.submitted' then exists (
      select 1 from ${mediaItems}
      where ${mediaItems.id} = ${notificationEntityIdIntSql}
        and ${mediaItems.publicationStatus} = 'submitted'
    )
    when 'franchise.submitted' then exists (
      select 1 from ${franchises}
      where ${franchises.id} = ${notificationEntityIdIntSql}
        and ${franchises.publicationStatus} = 'submitted'
    )
    when 'media-franchise.submitted' then exists (
      select 1 from ${mediaItemFranchises}
      where ${mediaItemFranchises.mediaItemId} = ${notificationMediaFranchiseMediaIdSql}
        and ${mediaItemFranchises.franchiseId} = ${notificationMediaFranchiseFranchiseIdSql}
        and ${mediaItemFranchises.publicationStatus} = 'submitted'
    )
    when 'media-franchise.removal.requested' then exists (
      select 1 from ${mediaItemFranchiseRemovalRequests}
      where ${mediaItemFranchiseRemovalRequests.mediaItemId} = ${notificationMediaFranchiseMediaIdSql}
        and ${mediaItemFranchiseRemovalRequests.franchiseId} = ${notificationMediaFranchiseFranchiseIdSql}
    )
    when 'review.submitted' then exists (
      select 1 from ${contributions}
      where ${contributions.id} = ${notificationEntityIdIntSql}
        and ${contributions.status} = 'submitted'
    )
    when 'bug-report.created' then exists (
      select 1 from ${bugReports}
      where ${bugReports.id} = ${notificationEntityIdIntSql}
        and ${bugReports.status} in ('new', 'reviewing')
    )
    else true
  end
)`

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
  statusLabel: string | null
  title: string
  type: NotificationType
}

type MediaFranchisePair = {
  franchiseId: number
  mediaItemId: number
}

function pairKey(pair: MediaFranchisePair) {
  return `${pair.mediaItemId}:${pair.franchiseId}`
}

function pairCondition(table: typeof mediaItemFranchises | typeof mediaItemFranchiseRemovalRequests, pair: MediaFranchisePair) {
  return and(eq(table.mediaItemId, pair.mediaItemId), eq(table.franchiseId, pair.franchiseId))
}

function anyPair(table: typeof mediaItemFranchises | typeof mediaItemFranchiseRemovalRequests, pairs: MediaFranchisePair[]) {
  const conditions = pairs.map((pair) => pairCondition(table, pair))
  return conditions.length === 1 ? conditions[0] : or(...conditions)
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
  const mediaFranchisePairs: MediaFranchisePair[] = []
  const removalPairs: MediaFranchisePair[] = []
  const seenMediaFranchiseKeys = new Set<string>()
  const seenRemovalKeys = new Set<string>()

  for (const row of rows) {
    if (!isNotificationType(row.type)) continue
    if (row.type === "media.submitted" || row.type === "media.approved") {
      const mediaItemId = parsePositiveInt(row.entityId)
      if (mediaItemId) mediaItemIds.add(mediaItemId)
      continue
    }
    if (row.type === "franchise.submitted" || row.type === "franchise.approved") {
      const franchiseId = parsePositiveInt(row.entityId)
      if (franchiseId) franchiseIds.add(franchiseId)
      continue
    }
    if (row.type === "review.submitted" || row.type === "review.approved") {
      const contributionId = parsePositiveInt(row.entityId)
      if (contributionId) reviewIds.add(contributionId)
      continue
    }
    const mediaFranchise = parseMediaFranchiseEntityId(row.entityId)
    if (!mediaFranchise) continue
    mediaItemIds.add(mediaFranchise.mediaItemId)
    if (row.type === "media-franchise.removal.requested") {
      const key = pairKey(mediaFranchise)
      if (seenRemovalKeys.has(key)) continue
      seenRemovalKeys.add(key)
      removalPairs.push(mediaFranchise)
      continue
    }
    const key = pairKey(mediaFranchise)
    if (seenMediaFranchiseKeys.has(key)) continue
    seenMediaFranchiseKeys.add(key)
    mediaFranchisePairs.push(mediaFranchise)
  }

  const [mediaItemRows, franchiseRows, reviewRows, mediaFranchiseRows, removalRows] = await Promise.all([
    mediaItemIds.size > 0
      ? db
          .select({
            code: mediaItems.code,
            id: mediaItems.id,
            publicationStatus: mediaItems.publicationStatus,
          })
          .from(mediaItems)
          .where(inArray(mediaItems.id, [...mediaItemIds]))
      : Promise.resolve([]),
    franchiseIds.size > 0
      ? db
          .select({
            code: franchises.code,
            id: franchises.id,
            publicationStatus: franchises.publicationStatus,
          })
          .from(franchises)
          .where(inArray(franchises.id, [...franchiseIds]))
      : Promise.resolve([]),
    reviewIds.size > 0
      ? db
          .select({
            code: mediaItems.code,
            contributionId: contributions.id,
            status: contributions.status,
          })
          .from(contributions)
          .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
          .where(inArray(contributions.id, [...reviewIds]))
      : Promise.resolve([]),
    mediaFranchisePairs.length > 0
      ? db
          .select({
            franchiseId: mediaItemFranchises.franchiseId,
            mediaItemId: mediaItemFranchises.mediaItemId,
            publicationStatus: mediaItemFranchises.publicationStatus,
          })
          .from(mediaItemFranchises)
          .where(anyPair(mediaItemFranchises, mediaFranchisePairs))
      : Promise.resolve([]),
    removalPairs.length > 0
      ? db
          .select({
            franchiseId: mediaItemFranchiseRemovalRequests.franchiseId,
            mediaItemId: mediaItemFranchiseRemovalRequests.mediaItemId,
          })
          .from(mediaItemFranchiseRemovalRequests)
          .where(anyPair(mediaItemFranchiseRemovalRequests, removalPairs))
      : Promise.resolve([]),
  ])

  const mediaItemById = new Map(mediaItemRows.map((row) => [row.id, row]))
  const franchiseById = new Map(franchiseRows.map((row) => [row.id, row]))
  const reviewByContributionId = new Map(reviewRows.map((row) => [row.contributionId, row]))
  const mediaFranchiseStatusByKey = new Map(
    mediaFranchiseRows.map((row) => [pairKey(row), row.publicationStatus]),
  )
  const openRemovalKeys = new Set(removalRows.map((row) => pairKey(row)))

  const items: NotificationListItem[] = []
  for (const row of rows) {
    if (!isNotificationType(row.type)) continue
    const mediaFranchise = parseMediaFranchiseEntityId(row.entityId)
    const entityId = parsePositiveInt(row.entityId)
    const mediaItemCode = row.type === "review.approved" || row.type === "review.submitted"
      ? reviewByContributionId.get(entityId ?? 0)?.code ?? null
      : mediaFranchise
        ? mediaItemById.get(mediaFranchise.mediaItemId)?.code ?? null
        : mediaItemById.get(entityId ?? 0)?.code ?? null
    const franchiseCode = franchiseById.get(entityId ?? 0)?.code ?? null
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
      statusLabel: resolveNotificationStatusLabel({
        entityId: row.entityId,
        franchiseById,
        mediaFranchiseStatusByKey,
        mediaItemById,
        openRemovalKeys,
        reviewByContributionId,
        type: row.type,
      }),
      title: row.title,
      type: row.type,
    })
  }

  return items
}

function resolveNotificationStatusLabel(input: {
  entityId: string
  franchiseById: Map<number, { publicationStatus: string }>
  mediaFranchiseStatusByKey: Map<string, string>
  mediaItemById: Map<number, { publicationStatus: string }>
  openRemovalKeys: Set<string>
  reviewByContributionId: Map<number, { status: string }>
  type: NotificationType
}) {
  if (!isAdminSubmissionNotificationType(input.type)) return null

  if (input.type === "media.submitted") {
    const mediaItemId = parsePositiveInt(input.entityId)
    return getAdminSubmissionStatusLabel(
      mediaItemId ? input.mediaItemById.get(mediaItemId)?.publicationStatus : null,
    )
  }

  if (input.type === "franchise.submitted") {
    const franchiseId = parsePositiveInt(input.entityId)
    return getAdminSubmissionStatusLabel(
      franchiseId ? input.franchiseById.get(franchiseId)?.publicationStatus : null,
    )
  }

  if (input.type === "review.submitted") {
    const contributionId = parsePositiveInt(input.entityId)
    return getAdminSubmissionStatusLabel(
      contributionId ? input.reviewByContributionId.get(contributionId)?.status : null,
    )
  }

  const mediaFranchise = parseMediaFranchiseEntityId(input.entityId)
  if (!mediaFranchise) return getAdminSubmissionStatusLabel(null)

  if (input.type === "media-franchise.removal.requested") {
    return getAdminSubmissionStatusLabel(
      input.openRemovalKeys.has(pairKey(mediaFranchise)) ? "submitted" : null,
    )
  }

  return getAdminSubmissionStatusLabel(
    input.mediaFranchiseStatusByKey.get(pairKey(mediaFranchise)) ?? null,
  )
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
        ...(input.recipientType === "admin" ? [adminSubmissionStillOpenSql] : []),
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

export async function deleteNotification(input: {
  notificationId: number
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  const [row] = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, input.notificationId),
        eq(notifications.recipientType, input.recipientType),
        eq(notifications.recipientId, input.recipientId),
      ),
    )
    .returning({ id: notifications.id })

  return row ?? null
}

export async function deleteAllRecipientNotifications(input: {
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  const rows = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.recipientType, input.recipientType),
        eq(notifications.recipientId, input.recipientId),
      ),
    )
    .returning({ id: notifications.id })

  return rows.length
}
