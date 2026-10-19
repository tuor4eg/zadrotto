import { NextResponse } from "next/server";

import {
  getPublishedFranchiseIdentityByCode,
  searchPublishedMediaItemsForFranchise,
} from "@/db/queries/franchises";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const [author, { code }] = await Promise.all([getCurrentAuthor(), params]);

  if (!author) {
    return NextResponse.json({ items: [] }, { status: 401 });
  }

  const searchQuery = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (searchQuery.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const [enabledMediaTypeCodes, franchise] = await Promise.all([
    getEnabledMediaTypeCodes(author.id),
    getPublishedFranchiseIdentityByCode(code),
  ]);

  if (!franchise) {
    return NextResponse.json({ items: [] }, { status: 404 });
  }

  const items = await searchPublishedMediaItemsForFranchise({
    authorId: author.id,
    enabledMediaTypeCodes,
    franchiseId: franchise.id,
    searchQuery,
  });

  return NextResponse.json({ items });
}
