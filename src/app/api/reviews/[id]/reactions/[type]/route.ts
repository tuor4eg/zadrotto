import {
  addPublishedReviewReaction,
  removePublishedReviewReaction,
} from "@/db/queries/review-reactions";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { isReviewReactionType, type ReviewReactionType } from "@/lib/reviews/reactions";

type RouteContext = {
  params: Promise<{ id: string; type: string }>;
};

function parseReviewId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function mutateReaction(
  operation: "add" | "remove",
  context: RouteContext,
) {
  const [author, { id: idValue, type: typeValue }] = await Promise.all([
    getCurrentAuthor(),
    context.params,
  ]);
  const reviewId = parseReviewId(idValue);

  if (!reviewId || !isReviewReactionType(typeValue)) {
    return Response.json({ error: "Некорректная реакция." }, { status: 400 });
  }

  if (!author) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const input = {
    accessibleMediaTypeCodes,
    reviewId,
    type: typeValue as ReviewReactionType,
    userId: author.id,
  };
  const result = operation === "add"
    ? await addPublishedReviewReaction(input)
    : await removePublishedReviewReaction(input);

  if (result.kind === "not-found") {
    return Response.json({ error: "Рецензия не найдена." }, { status: 404 });
  }

  if (result.kind === "forbidden") {
    return Response.json(
      { error: "Нельзя реагировать на собственную рецензию." },
      { status: 403 },
    );
  }

  return Response.json({ reactions: result.reactions });
}

export async function PUT(_request: Request, context: RouteContext) {
  return mutateReaction("add", context);
}

export async function DELETE(_request: Request, context: RouteContext) {
  return mutateReaction("remove", context);
}
