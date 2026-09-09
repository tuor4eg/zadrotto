export const NOTIFICATION_TRANSPORT_CODES = ["telegram"] as const

export type NotificationTransportCode = (typeof NOTIFICATION_TRANSPORT_CODES)[number]

export const TELEGRAM_TRANSPORT_CODE = "telegram" satisfies NotificationTransportCode
export const MISSING_NOTIFICATION_RECIPIENT = "__configuration__"
