import { matchesNormalizedSearch, normalizeSearchText } from "@/lib/search/normalize";

// Generic company descriptors and legal forms do not distinguish organizations.
const organizationCommonWords = new Set(`
    film films movie movies cinema cinematic motion picture pictures
    entertainment production productions animation animations animated
    studio studios group media multimedia company companies corporation corp
    incorporated inc limited ltd llc llp plc co gmbh ag sa sas srl spa bv nv pte pty
    television tv broadcasting broadcast network networks distribution distributors
    international worldwide global holdings holding enterprises enterprise
    digital interactive games gaming software publishing publisher publishers
    the and of
    фильм фильмы филм филмз кино кинокомпания кинокомпании киностудия киностудии студия студии
    продакшн продакшен анимация анимационная компания компании корпорация
    группа медиа телевидение дистрибуция издательство ооо оао зао пао ао
`.split(/\s+/).filter(Boolean));

export function creatorAutoApprovalNameParts(name: string, organization = false) {
    const normalized = normalizeSearchText(name);
    const words = [...new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? [])];
    return { normalized, words: organization ? words.filter(word => !organizationCommonWords.has(word)) : words };
}

export function escapeCreatorNameLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
}

export function escapeCreatorNameRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All variants must belong to the same creator. */
export function matchesCreatorAutoApprovalName(name: string, variants: readonly (string | null | undefined)[], organization = false) {
    const { normalized, words } = creatorAutoApprovalNameParts(name, organization);
    if (!normalized) return false;
    const names = variants.filter((value): value is string => value != null).map(normalizeSearchText);
    const fullNameMatches = organization
        ? names.some(value => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeCreatorNameRegex(normalized)}($|[^\\p{L}\\p{N}_])`, "u").test(value))
        : matchesNormalizedSearch(names, normalized);
    if (fullNameMatches) return true;
    if (words.length < 2) return false;
    const knownWords = new Set(names.flatMap(value => creatorAutoApprovalNameParts(value).words));
    return words.filter(word => knownWords.has(word)).length >= 2;
}
