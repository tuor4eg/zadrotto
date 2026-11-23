"use server";

import { revalidatePath } from "next/cache";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { mutateMediaItemTag } from "@/db/queries/tags";

export async function changeMediaItemTagAction(input: {
  mediaItemCode: string; tagId?: number; title?: string; remove?: boolean;
}) {
  const author = await requireAuthor();
  const accessibleTypes = await getAccessibleMediaTypeCodes(author.id);
  const item = await getMediaItemIdentityByCode(input.mediaItemCode, accessibleTypes);
  if (!item) return { error: "Запись недоступна." };
  try {
    await mutateMediaItemTag({
      authorId: author.id,
      mediaItemId: item.id,
      tagId: input.tagId,
      title: input.title,
      remove: input.remove,
    });
  } catch {
    return { error: "Не удалось изменить назначение тега." };
  }
  revalidatePath(`/media/${item.code}`);
  revalidatePath("/archive");
  revalidatePath("/achievements");
  return { error: null };
}
