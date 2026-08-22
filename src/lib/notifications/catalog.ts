export const NOTIFICATION_RECIPIENT_TYPES = ["admin", "author"] as const

export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number]

export const NOTIFICATION_TYPES = [
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
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_ENTITY_TYPES = [
  "media-item",
  "franchise",
  "media-franchise",
  "review",
  "bug-report",
] as const

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number]

const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  "media.submitted": "Новая заявка на запись",
  "media.approved": "Заявка на запись одобрена",
  "franchise.submitted": "Новая заявка на серию",
  "franchise.approved": "Заявка на серию одобрена",
  "media-franchise.submitted": "Новая заявка на связь с серией",
  "media-franchise.approved": "Заявка на связь с серией одобрена",
  "media-franchise.removal.requested": "Новая заявка на удаление связи с серией",
  "media-franchise.removal.approved": "Заявка на удаление связи одобрена",
  "review.submitted": "Новая заявка на рецензию",
  "review.approved": "Рецензия одобрена",
  "bug-report.created": "Новый багрепорт",
}

const NOTIFICATION_ENTITY_TYPE_BY_TYPE: Record<NotificationType, NotificationEntityType> = {
  "media.submitted": "media-item",
  "media.approved": "media-item",
  "franchise.submitted": "franchise",
  "franchise.approved": "franchise",
  "media-franchise.submitted": "media-franchise",
  "media-franchise.approved": "media-franchise",
  "media-franchise.removal.requested": "media-franchise",
  "media-franchise.removal.approved": "media-franchise",
  "review.submitted": "review",
  "review.approved": "review",
  "bug-report.created": "bug-report",
}

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value)
}

export function getNotificationTitle(type: NotificationType) {
  return NOTIFICATION_TITLES[type]
}

export function getNotificationEntityType(type: NotificationType) {
  return NOTIFICATION_ENTITY_TYPE_BY_TYPE[type]
}

export function getNotificationRecipientType(type: NotificationType): NotificationRecipientType {
  return type.endsWith(".approved") ? "author" : "admin"
}

export function isAdminSubmissionNotificationType(type: NotificationType) {
  return getNotificationRecipientType(type) === "admin" && type !== "bug-report.created"
}

export function getAdminSubmissionStatusLabel(status: string | null | undefined) {
  if (status === "submitted") return null
  if (status === "published") return "Уже опубликована"
  if (status === "rejected") return "Уже отклонена"
  if (status === "private" || status === "draft" || status === "hidden") return "Снята с модерации"
  return "Уже обработана"
}

export function getMediaFranchiseEntityId(mediaItemId: number, franchiseId: number) {
  return `${mediaItemId}:${franchiseId}`
}

export function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseMediaFranchiseEntityId(entityId: string) {
  const [mediaItemIdValue, franchiseIdValue] = entityId.split(":")
  const mediaItemId = parsePositiveInt(mediaItemIdValue ?? "")
  const franchiseId = parsePositiveInt(franchiseIdValue ?? "")
  if (!mediaItemId || !franchiseId) return null
  return { franchiseId, mediaItemId }
}

export function getNotificationHref(input: {
  entityId: string
  franchiseCode: string | null
  mediaItemCode: string | null
  type: NotificationType
}) {
  switch (input.type) {
    case "media.submitted":
      return `/admin/media/${input.entityId}/edit`
    case "media.approved":
      return input.mediaItemCode ? `/media/${input.mediaItemCode}` : null
    case "franchise.submitted":
    case "media-franchise.submitted":
    case "media-franchise.removal.requested":
      return "/admin/franchise-review"
    case "franchise.approved":
      return input.franchiseCode ? `/series/${input.franchiseCode}` : null
    case "media-franchise.approved":
    case "media-franchise.removal.approved":
      return input.mediaItemCode ? `/media/${input.mediaItemCode}` : null
    case "review.submitted":
      return `/admin/reviews/${input.entityId}`
    case "review.approved":
      return input.mediaItemCode ? `/media/${input.mediaItemCode}` : null
    case "bug-report.created":
      return `/admin/bug-reports/${input.entityId}`
  }
}
