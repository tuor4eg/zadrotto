import { NextResponse } from "next/server"

import { searchPublishedMediaItemsForReview } from "@/db/queries/contribution-reviews"
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types"
import { getCurrentAuthor } from "@/lib/auth/author-auth"

export async function GET(request: Request) {
  const author = await getCurrentAuthor()

  if (!author) {
    return NextResponse.json({ items: [] }, { status: 401 })
  }

  const searchQuery = new URL(request.url).searchParams.get("q")?.trim() ?? ""

  if (searchQuery.length < 2) {
    return NextResponse.json({ items: [] })
  }

  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(author.id)
  const items = await searchPublishedMediaItemsForReview(
    searchQuery,
    enabledMediaTypeCodes,
    { authorId: author.id },
  )

  return NextResponse.json({ items })
}
