import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { canManageFranchises } from "@/lib/franchises/access";
import { NextResponse } from "next/server";

import {
  getPublishedFranchiseIdentityByCode,
  searchPublishedMediaItemsForFranchise,
} from "@/db/queries/franchises";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";
import { getEnabledMediaTypeCodes } from "@/db/queries/media-types";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const admin = await getCurrentAdminUser();
  const consentDenial = admin ? null : await getPersonalDataConsentDenial();
  if (consentDenial) return consentDenial;
  const [author, { code }] = await Promise.all([getCurrentAuthor(), params]);

  if (!admin && !canManageFranchises(author)) {
    return NextResponse.json({ items: [] }, { status: 401 });
  }

  const searchQuery = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (searchQuery.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const [enabledMediaTypeCodes, franchise] = await Promise.all([
    getEnabledMediaTypeCodes(admin ? undefined : author?.id),
    getPublishedFranchiseIdentityByCode(code),
  ]);

  if (!franchise) {
    return NextResponse.json({ items: [] }, { status: 404 });
  }

  const items = await searchPublishedMediaItemsForFranchise({
    authorId: author?.id ?? 0,
    enabledMediaTypeCodes,
    franchiseId: franchise.id,
    searchQuery,
  });

  return NextResponse.json({ items });
}
