"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMediaItemIdentityForAuthorRating } from "@/db/queries/media-items";
import { deleteAuthorRating, upsertAuthorRating } from "@/db/queries/ratings";
import { getCurrentAuthor } from "@/lib/author-auth";
import { parseRatingScoreInput } from "@/lib/rating-score";

export type SaveAuthorRatingState = {
  error: string | null;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function revalidateRatingPaths(input: {
  mediaItemId: number;
  mediaItemCode: string;
  franchiseCode: string;
}) {
  revalidatePath("/");
  revalidatePath(`/media/${input.mediaItemCode}`);
  revalidatePath(`/author/media/${input.mediaItemId}`);
  revalidatePath("/author/media");

  if (input.franchiseCode) {
    revalidatePath(`/franchises/${input.franchiseCode}`);
  }
}

export async function saveAuthorRatingAction(
  _state: SaveAuthorRatingState,
  formData: FormData,
): Promise<SaveAuthorRatingState> {
  const author = await getCurrentAuthor();

  if (!author) {
    redirect("/author/login");
  }

  const mediaItemCode = getFormString(formData, "mediaItemCode");
  const franchiseCode = getFormString(formData, "franchiseCode");
  const intent = getFormString(formData, "intent");
  const score = parseRatingScoreInput(formData.get("score"));

  if (!mediaItemCode) {
    return { error: "Не удалось определить запись архива." };
  }

  const mediaItem = await getMediaItemIdentityForAuthorRating(mediaItemCode, author.id);

  if (!mediaItem) {
    return { error: "Запись архива не найдена." };
  }
  const relatedFranchiseCode = franchiseCode || mediaItem.franchiseCode || "";

  if (intent === "delete") {
    await deleteAuthorRating({
      mediaItemId: mediaItem.id,
      authorId: author.id,
    });

    revalidateRatingPaths({
      mediaItemId: mediaItem.id,
      mediaItemCode: mediaItem.code,
      franchiseCode: relatedFranchiseCode,
    });

    return { error: null };
  }

  if (score === null) {
    return { error: "Выбери целую оценку от 1 до 10." };
  }

  await upsertAuthorRating({
    mediaItemId: mediaItem.id,
    authorId: author.id,
    score,
  });

  revalidateRatingPaths({
    mediaItemId: mediaItem.id,
    mediaItemCode: mediaItem.code,
    franchiseCode: relatedFranchiseCode,
  });

  return { error: null };
}
