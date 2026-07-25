import { NextResponse } from "next/server";

import {
  getFranchiseByCode,
  searchPublishedMediaItemsForFranchise,
} from "@/db/queries/franchises";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

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

  const franchise = await getFranchiseByCode(code);

  if (!franchise) {
    return NextResponse.json({ items: [] }, { status: 404 });
  }

  const items = await searchPublishedMediaItemsForFranchise({
    authorId: author.id,
    franchiseId: franchise.id,
    searchQuery,
  });

  return NextResponse.json({ items });
}
