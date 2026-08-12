import { NextResponse } from "next/server";

import { claimPendingAchievementAnnouncement } from "@/db/queries/achievements";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function GET() {
  const author = await getCurrentAuthor();

  if (!author) {
    return NextResponse.json({ authenticated: false, group: null });
  }

  const group = await claimPendingAchievementAnnouncement(author.id);

  return NextResponse.json({ authenticated: true, group });
}
