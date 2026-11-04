import { NextResponse } from "next/server"

import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth"
import {
  deleteAllInboxNotifications,
  getNotificationInbox,
  unauthenticatedNotificationInbox,
} from "@/lib/notifications/inbox"

export async function GET() {
  const consentDenial = await getPersonalDataConsentDenial();
  if (consentDenial) return consentDenial;
  const author = await getCurrentAuthor()
  if (!author) {
    return NextResponse.json(unauthenticatedNotificationInbox())
  }

  return NextResponse.json(
    await getNotificationInbox({
      recipientId: author.id,
      recipientType: "author",
    }),
  )
}

export async function DELETE() {
  const consentDenial = await getPersonalDataConsentDenial();
  if (consentDenial) return consentDenial;
  const author = await getCurrentAuthor()
  if (!author) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  await deleteAllInboxNotifications({
    recipientId: author.id,
    recipientType: "author",
  })

  return NextResponse.json({ ok: true })
}
