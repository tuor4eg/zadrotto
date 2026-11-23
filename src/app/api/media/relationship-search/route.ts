import { searchPublishedMediaItems } from "@/db/queries/inline-mention-media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";
import { normalizeSearchText } from "@/lib/search/normalize";

export async function GET(request: Request) {
  const denial = await getPersonalDataConsentDenial();
  if (denial) return denial;
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ items: [] }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.length > 200 || normalizeSearchText(query).length < 2) return Response.json({ items: [] });
  const items = await searchPublishedMediaItems({
    query,
    accessibleMediaTypeCodes: await getAccessibleMediaTypeCodes(author.id),
    limit: 8,
  });

  return Response.json({
    items: items.map(({ id, title, originalTitle, mediaTypeName, releaseYear }) => ({
      id, title, originalTitle, mediaTypeName, releaseYear,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
