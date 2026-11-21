"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authors } from "@/db/schema";
import { requireAuthor } from "@/lib/auth/author-auth";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getMediaItemIdentityByCode } from "@/db/queries/media-items";
import { mutateMediaItemTag } from "@/db/queries/tags";

export async function changeMediaItemTagAction(input: {
  mediaItemCode: string; tagId?: number; title?: string; remove?: boolean; editorial?: boolean;
}) {
  let authorId: number;
  let accessibleTypes: string[];
  if (input.editorial) {
    await requireAdminUser();
    const systemAuthors = await db.select({ id: authors.id }).from(authors).where(eq(authors.isSystem, true));
    if (systemAuthors.length !== 1) return { error: "Не удалось определить редакционный аккаунт." };
    authorId = systemAuthors[0].id;
    accessibleTypes = await getAccessibleMediaTypeCodes();
  } else {
    const author = await requireAuthor();
    authorId = author.id;
    accessibleTypes = await getAccessibleMediaTypeCodes(author.id);
  }
  const item = await getMediaItemIdentityByCode(input.mediaItemCode, accessibleTypes);
  if (!item) return { error: "Запись недоступна." };
  try {
    await mutateMediaItemTag({ ...input, authorId, mediaItemId: item.id });
  } catch {
    return { error: "Не удалось изменить назначение тега." };
  }
  revalidatePath(`/media/${item.code}`);
  revalidatePath("/archive");
  revalidatePath("/achievements");
  return { error: null };
}
