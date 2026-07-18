import { NextResponse } from "next/server";

import { findPublishedFranchiseDuplicateCandidates } from "@/db/queries/franchises";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  createFranchiseDuplicateAcknowledgementToken,
  isExactFranchiseDuplicate,
} from "@/lib/franchises/franchise-duplicates";

export async function POST(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);

  if (!adminUser && !author) return NextResponse.json({ matches: [] }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; originalTitle?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const originalTitle = typeof body.originalTitle === "string" && body.originalTitle.trim()
    ? body.originalTitle.trim()
    : null;

  if (title.length < 2) return NextResponse.json({ matches: [], exactMatchIds: [], acknowledgementToken: "" });

  const form = { title, originalTitle };
  const matches = await findPublishedFranchiseDuplicateCandidates(form);
  const exactMatches = matches.filter((match) => isExactFranchiseDuplicate(form, match));
  const possibleMatches = matches.filter((match) => !exactMatches.includes(match));

  return NextResponse.json({
    matches,
    exactMatchIds: exactMatches.map((match) => match.id),
    acknowledgementToken: possibleMatches.length
      ? createFranchiseDuplicateAcknowledgementToken({ form, matches: possibleMatches })
      : "",
  });
}
