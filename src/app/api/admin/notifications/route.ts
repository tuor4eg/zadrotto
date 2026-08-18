import { NextResponse } from "next/server"

import { getCurrentAdminUser } from "@/lib/auth/admin-auth"
import {
  deleteAllInboxNotifications,
  getNotificationInbox,
  unauthenticatedNotificationInbox,
} from "@/lib/notifications/inbox"

export async function GET() {
  const adminUser = await getCurrentAdminUser()
  if (!adminUser) {
    return NextResponse.json(unauthenticatedNotificationInbox())
  }

  return NextResponse.json(
    await getNotificationInbox({
      recipientId: adminUser.id,
      recipientType: "admin",
    }),
  )
}

export async function DELETE() {
  const adminUser = await getCurrentAdminUser()
  if (!adminUser) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  await deleteAllInboxNotifications({
    recipientId: adminUser.id,
    recipientType: "admin",
  })

  return NextResponse.json({ ok: true })
}
