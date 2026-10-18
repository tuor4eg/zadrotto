"use server";

import { getMediaItemByCode } from "@/db/queries/media-items";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";
import { getTitlePartsForMediaItem } from "@/db/queries/title-parts";
import { getTitlePartLabel, isTitlePartRateable } from "@/lib/media/title-parts";

export async function getRatingDialogData(code: string, partId?: number | null) {
  const author = await getCurrentAuthor();
  const accessibleMediaTypes = await getAccessibleMediaTypeCodes(author?.id);
  const item = await getMediaItemByCode(code, accessibleMediaTypes, author?.id);
  if (!item) throw new Error("Запись недоступна.");
  const part = partId == null ? null : (await getTitlePartsForMediaItem(item.id, author?.id))
    .find((part) => part.id === partId && isTitlePartRateable(part));
  if (partId != null && !part) throw new Error("Часть записи недоступна.");

  return {
    mediaItemCode: item.code,
    partId: part?.id ?? null,
    title: [resolveMediaItemDisplayTitles(item).displayTitle, part ? getTitlePartLabel(part) : null].filter(Boolean).join(" — "),
    currentAuthor: author ? { name: author.name, code: author.code } : null,
    currentAuthorScore: part ? part.myRating : item.currentAuthorScore,
    currentAuthorFirstExperiencedAt: item.currentAuthorFirstExperiencedAt,
    currentAuthorFirstExperiencedPrecision: item.currentAuthorFirstExperiencedPrecision,
    releaseYear: item.releaseYear,
  };
}
