import { NextResponse } from "next/server"

import { getCurrentAuthor } from "@/lib/auth/author-auth"
import {
  getNotificationInbox,
  unauthenticatedNotificationInbox,
} from "@/lib/notifications/inbox"

export async function GET() {
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
