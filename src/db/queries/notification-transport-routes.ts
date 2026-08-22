import { eq } from "drizzle-orm"

import { db } from "@/db"
import { adminActivityLogs, notificationTransportRoutes } from "@/db/schema"
import type { CreateActivityLogInput } from "@/db/queries/activity-logs"
import type { NotificationType } from "@/lib/notifications/catalog"
import {
  getExternalNotificationRoute,
  isExternalNotificationRouteCode,
  normalizeExternalTransportCodes,
  type ExternalNotificationRouteCode,
} from "@/lib/notifications/routes"
import type { NotificationTransportCode } from "@/lib/notifications/transports/catalog"

function asTransportCodes(value: unknown) {
  return normalizeExternalTransportCodes(value) ?? []
}

export async function getNotificationTransportRouteState() {
  const rows = await db
    .select({
      code: notificationTransportRoutes.code,
      transportCodes: notificationTransportRoutes.transportCodes,
    })
    .from(notificationTransportRoutes)

  const transportCodesByRoute = new Map<ExternalNotificationRouteCode, NotificationTransportCode[]>()
  for (const row of rows) {
    if (!isExternalNotificationRouteCode(row.code)) continue
    transportCodesByRoute.set(row.code, asTransportCodes(row.transportCodes))
  }

  return {
    submission_created: {
      telegram: (transportCodesByRoute.get("submission_created") ?? []).includes("telegram"),
    },
    bug_report_created: {
      telegram: (transportCodesByRoute.get("bug_report_created") ?? []).includes("telegram"),
    },
  }
}

export async function getEnabledExternalTransportCodes(type: NotificationType) {
  const route = getExternalNotificationRoute(type)
  if (!route) return []

  const [row] = await db
    .select({ transportCodes: notificationTransportRoutes.transportCodes })
    .from(notificationTransportRoutes)
    .where(eq(notificationTransportRoutes.code, route.code))
    .limit(1)

  return asTransportCodes(row?.transportCodes)
}

export async function saveNotificationTransportRoutes(input: {
  adminId: number
  activityLog: CreateActivityLogInput
  routes: Record<ExternalNotificationRouteCode, NotificationTransportCode[]>
}) {
  await db.transaction(async (tx) => {
    for (const [code, transportCodes] of Object.entries(input.routes) as Array<
      [ExternalNotificationRouteCode, NotificationTransportCode[]]
    >) {
      await tx
        .insert(notificationTransportRoutes)
        .values({
          code,
          transportCodes,
          updatedByAdminId: input.adminId,
        })
        .onConflictDoUpdate({
          target: notificationTransportRoutes.code,
          set: {
            transportCodes,
            updatedByAdminId: input.adminId,
            updatedAt: new Date(),
          },
        })
    }
    await tx.insert(adminActivityLogs).values(input.activityLog)
  })
}
