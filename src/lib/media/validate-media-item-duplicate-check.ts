import { findPublishedMediaItemDuplicateCandidates } from "@/db/queries/media-items";
import {
  isExactMediaItemDuplicate,
  verifyMediaItemDuplicateAcknowledgementToken,
  type MediaItemDuplicateCheckInput,
} from "@/lib/media/media-item-duplicates";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function validateMediaItemDuplicateCheck(
  formData: FormData,
  input: MediaItemDuplicateCheckInput,
) {
  const matches = await findPublishedMediaItemDuplicateCandidates(input);
  const exactMatches = matches.filter((match) => isExactMediaItemDuplicate(input, match));

  if (exactMatches.length > 0) {
    return { ok: false as const, error: "duplicate-media-exact" };
  }

  const possibleMatches = matches.filter((match) => !exactMatches.includes(match));

  if (possibleMatches.length === 0) {
    return { ok: true as const };
  }

  const isAcknowledged = getFormString(formData, "mediaDuplicateAcknowledged") === "1";
  const acknowledgementToken = getFormString(formData, "mediaDuplicateCheckToken");

  return isAcknowledged &&
    verifyMediaItemDuplicateAcknowledgementToken(acknowledgementToken, {
      form: input,
      matches: possibleMatches,
    })
    ? { ok: true as const }
    : { ok: false as const, error: "duplicate-media-possible" };
}
