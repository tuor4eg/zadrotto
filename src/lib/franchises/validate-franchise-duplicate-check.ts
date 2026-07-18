import { findPublishedFranchiseDuplicateCandidates } from "@/db/queries/franchises";
import {
  isExactFranchiseDuplicate,
  verifyFranchiseDuplicateAcknowledgementToken,
  type FranchiseDuplicateCheckInput,
} from "@/lib/franchises/franchise-duplicates";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function validateFranchiseDuplicateCheck(
  formData: FormData,
  input: FranchiseDuplicateCheckInput,
) {
  const matches = await findPublishedFranchiseDuplicateCandidates(input);
  const exactMatches = matches.filter((match) => isExactFranchiseDuplicate(input, match));

  if (exactMatches.length > 0) {
    return { ok: false as const, error: "duplicate-franchise-exact" };
  }

  const possibleMatches = matches.filter((match) => !exactMatches.includes(match));

  if (possibleMatches.length === 0) {
    return { ok: true as const };
  }

  const acknowledged = getFormString(formData, "franchiseDuplicateAcknowledged") === "1";
  const token = getFormString(formData, "franchiseDuplicateCheckToken");

  return acknowledged &&
    verifyFranchiseDuplicateAcknowledgementToken(token, { form: input, matches: possibleMatches })
    ? { ok: true as const }
    : { ok: false as const, error: "duplicate-franchise-possible" };
}
