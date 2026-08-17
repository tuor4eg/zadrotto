import {
  getUnreadNotificationCount,
  listRecipientNotifications,
  markNotificationRead,
  type NotificationListItem,
} from "@/db/queries/notifications"
import type { NotificationRecipientType } from "@/lib/notifications/catalog"

export type NotificationInboxPayload = {
  authenticated: boolean
  items: Array<{
    body: string
    createdAt: string
    href: string | null
    id: number
    readAt: string | null
    title: string
    type: string
  }>
  unreadCount: number
}

function serializeNotificationItem(item: NotificationListItem) {
  return {
    body: item.body,
    createdAt: item.createdAt.toISOString(),
    href: item.href,
    id: item.id,
    readAt: item.readAt?.toISOString() ?? null,
    title: item.title,
    type: item.type,
  }
}

export function unauthenticatedNotificationInbox(): NotificationInboxPayload {
  return { authenticated: false, items: [], unreadCount: 0 }
}

export async function getNotificationInbox(input: {
  recipientId: number
  recipientType: NotificationRecipientType
}): Promise<NotificationInboxPayload> {
  const [unreadCount, items] = await Promise.all([
    getUnreadNotificationCount(input),
    listRecipientNotifications(input),
  ])

  return {
    authenticated: true,
    items: items.map(serializeNotificationItem),
    unreadCount,
  }
}

export async function markRecipientNotificationRead(input: {
  notificationId: number
  recipientId: number
  recipientType: NotificationRecipientType
}) {
  return markNotificationRead(input)
}
