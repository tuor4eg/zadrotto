import type { NotificationType } from "@/lib/notifications/catalog"
import {
  NOTIFICATION_TRANSPORT_CODES,
  TELEGRAM_TRANSPORT_CODE,
  type NotificationTransportCode,
} from "@/lib/notifications/transports/catalog"

export const EXTERNAL_NOTIFICATION_ROUTE_CODES = ["submission_created", "bug_report_created"] as const

export type ExternalNotificationRouteCode = (typeof EXTERNAL_NOTIFICATION_ROUTE_CODES)[number]

export const SUBMISSION_CREATED_ROUTE_CODE = "submission_created" satisfies ExternalNotificationRouteCode
export const BUG_REPORT_CREATED_ROUTE_CODE = "bug_report_created" satisfies ExternalNotificationRouteCode

export const SUBMISSION_CREATED_NOTIFICATION_TYPES = [
  "media.submitted",
  "franchise.submitted",
  "media-franchise.submitted",
  "media-franchise.removal.requested",
  "review.submitted",
] as const satisfies readonly NotificationType[]

export const EXTERNAL_NOTIFICATION_ROUTES = [
  {
    code: SUBMISSION_CREATED_ROUTE_CODE,
    description: "Запись, серия, связь с серией или рецензия отправлены на модерацию.",
    label: "Новая заявка",
    notificationTypes: SUBMISSION_CREATED_NOTIFICATION_TYPES,
  },
  {
    code: BUG_REPORT_CREATED_ROUTE_CODE,
    description: "Пользователь сообщил об ошибке.",
    label: "Новый багрепорт",
    notificationTypes: ["bug-report.created"],
  },
] as const

export function isExternalNotificationRouteCode(value: string): value is ExternalNotificationRouteCode {
  return (EXTERNAL_NOTIFICATION_ROUTE_CODES as readonly string[]).includes(value)
}

export function getExternalNotificationRoute(type: NotificationType) {
  return EXTERNAL_NOTIFICATION_ROUTES.find((route) =>
    (route.notificationTypes as readonly NotificationType[]).includes(type),
  ) ?? null
}

export function normalizeExternalTransportCodes(values: unknown) {
  if (!Array.isArray(values)) return null
  const transportCodes: NotificationTransportCode[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (typeof value !== "string") return null
    if (!(NOTIFICATION_TRANSPORT_CODES as readonly string[]).includes(value)) return null
    if (seen.has(value)) continue
    seen.add(value)
    transportCodes.push(value as NotificationTransportCode)
  }

  return transportCodes
}

export function parseExternalNotificationRouteForm(formData: FormData) {
  const routes: Record<ExternalNotificationRouteCode, NotificationTransportCode[]> = {
    submission_created: formData.get("submission_created_telegram") === "1"
      ? [TELEGRAM_TRANSPORT_CODE]
      : [],
    bug_report_created: formData.get("bug_report_created_telegram") === "1"
      ? [TELEGRAM_TRANSPORT_CODE]
      : [],
  }
  return routes
}

const EXTERNAL_MESSAGE_LIMIT = 4096

export function formatExternalNotificationText(input: {
  body: string
  href: string | null
  siteOrigin: string | null
  title: string
}) {
  const lines = [input.title, input.body]
  if (input.href && input.siteOrigin) {
    lines.push(new URL(input.href, input.siteOrigin).toString())
  } else if (input.href) {
    lines.push(input.href)
  }
  return lines.join("\n").slice(0, EXTERNAL_MESSAGE_LIMIT)
}
