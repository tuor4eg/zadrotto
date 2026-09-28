import { getPublishedReviewReactionSummary } from "@/db/queries/review-reactions";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseReviewId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const [author, { id: idValue }] = await Promise.all([getCurrentAuthor(), params]);
  const reviewId = parseReviewId(idValue);

  if (!reviewId) {
    return Response.json({ error: "Некорректный идентификатор рецензии." }, { status: 400 });
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author?.id);
  const result = await getPublishedReviewReactionSummary({
    accessibleMediaTypeCodes,
    reviewId,
    userId: author?.id ?? null,
  });

  if (result.kind === "not-found") {
    return Response.json({ error: "Рецензия не найдена." }, { status: 404 });
  }

  return Response.json({ reactions: result.reactions });
}
