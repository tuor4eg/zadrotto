import { NextResponse } from "next/server"

import { getCurrentAdminUser } from "@/lib/auth/admin-auth"
import { parsePositiveInt } from "@/lib/notifications/catalog"
import { deleteRecipientNotification } from "@/lib/notifications/inbox"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const adminUser = await getCurrentAdminUser()
  if (!adminUser) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { id } = await params
  const notificationId = parsePositiveInt(id)
  if (!notificationId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await deleteRecipientNotification({
    notificationId,
    recipientId: adminUser.id,
    recipientType: "admin",
  })

  return NextResponse.json({ ok: true })
}
