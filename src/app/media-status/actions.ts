"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthorMediaStatusConflictError,
  toggleAuthorMediaStatus,
} from "@/db/queries/author-media-statuses";
import { getMediaItemIdentityForAuthorRating } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { isAuthorMediaStatus } from "@/lib/media/author-media-status";

export type ToggleAuthorMediaStatusState = { error: string | null };

export async function toggleAuthorMediaStatusAction(
  _state: ToggleAuthorMediaStatusState,
  formData: FormData,
): Promise<ToggleAuthorMediaStatusState> {
  const author = await getCurrentAuthor();

  if (!author) {
    redirect("/author/login");
  }

  const mediaItemCode = formData.get("mediaItemCode");
  const status = formData.get("status");

  if (typeof mediaItemCode !== "string" || !mediaItemCode.trim()) {
    return { error: "Не удалось определить запись архива." };
  }

  if (typeof status !== "string" || !isAuthorMediaStatus(status)) {
    return { error: "Неизвестный статус записи." };
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id);
  const mediaItem = await getMediaItemIdentityForAuthorRating(
    mediaItemCode.trim(),
    author.id,
    accessibleMediaTypeCodes,
  );

  if (!mediaItem) {
    return { error: "Запись архива не найдена." };
  }

  try {
    await toggleAuthorMediaStatus({ authorId: author.id, mediaItemId: mediaItem.id, status });
  } catch (error) {
    if (error instanceof AuthorMediaStatusConflictError) {
      return { error: "Статус доступен только для записи без вашей оценки." };
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath(`/media/${mediaItem.code}`);
  revalidatePath(`/author/media/${mediaItem.id}`);
  revalidatePath("/author/media");
  for (const franchise of mediaItem.franchises) {
    revalidatePath(`/series/${franchise.code}`);
  }

  return { error: null };
}
