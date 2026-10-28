import { matchesNormalizedSearch, normalizeSearchText } from "@/lib/search/normalize";

export function creatorAutoApprovalNameParts(name: string) {
    const normalized = normalizeSearchText(name);
    const words = [...new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? [])];
    return { normalized, words };
}

export function escapeCreatorNameLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
}

export function escapeCreatorNameRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All variants must belong to the same creator. */
export function matchesCreatorAutoApprovalName(name: string, variants: readonly (string | null | undefined)[]) {
    const { normalized, words } = creatorAutoApprovalNameParts(name);
    if (!normalized) return false;
    const names = variants.filter((value): value is string => value != null).map(normalizeSearchText);
    if (matchesNormalizedSearch(names, normalized)) return true;
    if (words.length < 2) return false;
    const knownWords = new Set(names.flatMap(value => creatorAutoApprovalNameParts(value).words));
    return words.filter(word => knownWords.has(word)).length >= 2;
}
