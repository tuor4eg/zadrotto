import { NextResponse } from "next/server";

import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { recordRecentlyViewed } from "@/lib/main-page/recently-viewed";

export async function POST(request: Request) {
  const author = await getCurrentAuthor();
  if (!author) return new NextResponse(null, { status: 204 });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return new NextResponse(null, { status: 204 });

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const item = await getMediaItemIdentityByCode(code, accessibleMediaTypeCodes);
  if (!item) return new NextResponse(null, { status: 204 });

  const settings = await getArchiveSettings();
  await recordRecentlyViewed({
    authorId: author.id,
    historyLimit: settings.recentlyViewedHistoryLimit,
    mediaItemId: item.id,
    ttlDays: settings.recentlyViewedTtlDays,
  });

  return NextResponse.json({ recorded: true });
}
