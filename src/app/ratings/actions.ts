"use server";

import { isTitlePartRateable } from "@/lib/media/title-parts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteAuthorMediaExperience,
  upsertAuthorMediaExperience,
} from "@/db/queries/author-media-experiences";
import { getMediaItemIdentityForAuthorRating } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { deleteAuthorRating, upsertAuthorRating } from "@/db/queries/ratings";
import { getTitlePart } from "@/db/queries/title-parts";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  isFirstExperienceBeforeRelease,
  parseFirstExperiencedInput,
} from "@/lib/authors/experience-date";
import { parseRatingScoreInput } from "@/lib/ratings/score";

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
}) {
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath(`/media/${input.mediaItemCode}`);
  revalidatePath(`/author/media/${input.mediaItemId}`);
  revalidatePath("/author/media");

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
  const rawPartId = getFormString(formData, "partId");
  const partId = rawPartId ? Number(rawPartId) : null;
  if (partId !== null && (!/^\d+$/.test(rawPartId) || !Number.isSafeInteger(partId) || partId <= 0)) {
    return { error: "Не удалось определить часть записи." };
  }
  const intent = getFormString(formData, "intent");
  const score = parseRatingScoreInput(formData.get("score"));
  const shouldUpdateExperience = partId === null && formData.has("firstExperiencedValue");
  const firstExperiencedValue = getFormString(formData, "firstExperiencedValue");
  const firstExperiencedPrecision = getFormString(formData, "firstExperiencedPrecision");

  if (!mediaItemCode) {
    return { error: "Не удалось определить запись архива." };
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const mediaItem = await getMediaItemIdentityForAuthorRating(
    mediaItemCode,
    author.id,
    accessibleMediaTypeCodes,
  );

  if (!mediaItem) {
    return { error: "Запись архива не найдена." };
  }
  const part = partId === null ? null : await getTitlePart(mediaItem.id, partId);
  if (partId !== null && !part) {
    return { error: "Часть записи не найдена." };
  }
  if (partId !== null && formData.has("firstExperiencedValue")) {
    return { error: "Дата знакомства относится к записи целиком." };
  }
  if (intent === "delete") {
    await deleteAuthorRating({
      mediaItemId: mediaItem.id,
      authorId: author.id,
      partId,
    });

    revalidateRatingPaths({
      mediaItemId: mediaItem.id,
      mediaItemCode: mediaItem.code,
    });

    return { error: null };
  }

  if (part && !isTitlePartRateable(part)) {
    return { error: "Спецвыпуски не оцениваются." };
  }

  if (score === null) {
    return { error: "Выбери целую оценку от 1 до 10." };
  }

  const firstExperience =
    shouldUpdateExperience && firstExperiencedValue
      ? parseFirstExperiencedInput(firstExperiencedValue, firstExperiencedPrecision)
      : null;

  if (shouldUpdateExperience && firstExperiencedValue && !firstExperience) {
    return { error: "Проверь дату знакомства." };
  }

  if (
    firstExperience &&
    isFirstExperienceBeforeRelease({
      firstExperiencedAt: firstExperience.firstExperiencedAt,
      releaseYear: mediaItem.releaseYear,
    })
  ) {
    return { error: "Год знакомства не может быть раньше года выхода." };
  }

  await upsertAuthorRating({
    mediaItemId: mediaItem.id,
    authorId: author.id,
    score,
    partId,
  });

  if (shouldUpdateExperience) {
    if (firstExperience) {
      await upsertAuthorMediaExperience({
        mediaItemId: mediaItem.id,
        authorId: author.id,
        ...firstExperience,
      });
    } else {
      await deleteAuthorMediaExperience({
        mediaItemId: mediaItem.id,
        authorId: author.id,
      });
    }
  }

  revalidateRatingPaths({
    mediaItemId: mediaItem.id,
    mediaItemCode: mediaItem.code,
  });

  return { error: null };
}
