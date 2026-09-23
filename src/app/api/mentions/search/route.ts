import { NextResponse } from "next/server";

import { searchPublishedMediaItems } from "@/db/queries/inline-mention-media-items";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import type { MentionSuggestion } from "@/lib/inline-mentions/markup";
import { getMentionTriggerConfig } from "@/lib/inline-mentions/registry";
import { normalizeSearchText } from "@/lib/search/normalize";

const MAX_QUERY_LENGTH = 100;

export async function GET(request: Request) {
  const author = await getCurrentAuthor();
  if (!author) return NextResponse.json({ items: [] }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const trigger = searchParams.get("trigger") ?? "@";
  const triggerConfig = getMentionTriggerConfig(trigger);
  const query = searchParams.get("q")?.slice(0, MAX_QUERY_LENGTH) ?? "";

  if (!triggerConfig || normalizeSearchText(query).length < 2) {
    return NextResponse.json({ items: [] });
  }

  const enabledMediaTypeCodes = await getEnabledMediaTypeCodes(author.id);
  const rows = await searchPublishedMediaItems({
    query,
    accessibleMediaTypeCodes: enabledMediaTypeCodes,
    limit: 20,
  });
  const items: MentionSuggestion[] = rows.map((item) => ({
    type: "title",
    id: String(item.id),
    label: item.title,
    subtitle: [
      item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : null,
      item.mediaTypeName,
      item.releaseYear,
    ].filter(Boolean).join(" · "),
    image: item.coverThumbUrl ?? item.coverUrl ?? undefined,
  }));

  return NextResponse.json({ items });
}
