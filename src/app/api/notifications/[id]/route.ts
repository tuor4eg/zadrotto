import { NextResponse } from "next/server"

import { getCurrentAuthor } from "@/lib/auth/author-auth"
import { parsePositiveInt } from "@/lib/notifications/catalog"
import { deleteRecipientNotification } from "@/lib/notifications/inbox"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const author = await getCurrentAuthor()
  if (!author) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { id } = await params
  const notificationId = parsePositiveInt(id)
  if (!notificationId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await deleteRecipientNotification({
    notificationId,
    recipientId: author.id,
    recipientType: "author",
  })

  return NextResponse.json({ ok: true })
}
