import type { MediaTitleCandidate, SignedMediaTitleCandidate } from "@/lib/covers/types"
import { normalizeSearchText } from "@/lib/search/normalize"
import type { MetadataIssueCode } from "./metadata-issue"

function normalizeCandidateTitle(value: string | null | undefined) {
  return normalizeSearchText(value ?? "")
}

export type MetadataMatchInput = {
  originalTitle: string
  platformCode?: string | null
  releaseYear: string
  title: string
}

function candidateMatchesPlatform(candidate: MediaTitleCandidate, platformCode: string) {
  const names = candidate.platforms ?? []
  const normalizedNames = names.map(normalizeSearchText)
  const aliases: Record<string, string[]> = {
    arcade: ["arcade"],
    gamecube: ["gamecube", "nintendo gamecube"],
    mobile: ["android", "ios", "iphone", "ipad", "mobile"],
    n64: ["nintendo 64", "n64"],
    nes: ["nintendo entertainment system", "nes", "famicom"],
    pc: ["pc", "pc (microsoft windows)", "windows"],
    ps1: ["playstation", "playstation 1", "ps1"],
    ps2: ["playstation 2", "ps2"],
    ps3: ["playstation 3", "ps3"],
    ps4: ["playstation 4", "ps4"],
    ps5: ["playstation 5", "ps5"],
    sega: ["sega genesis", "sega mega drive/genesis", "sega mega drive", "mega drive"],
    snes: ["super nintendo entertainment system", "snes", "super famicom"],
    switch: ["nintendo switch", "switch"],
    wii: ["wii", "nintendo wii"],
    "zx-spectrum": ["zx spectrum"],
  }
  return (aliases[platformCode] ?? [platformCode]).some((alias) =>
    normalizedNames.includes(normalizeSearchText(alias)))
}

function hasExactMetadataTitle(candidate: MediaTitleCandidate, input: MetadataMatchInput) {
  const normalizedTitle = normalizeCandidateTitle(input.title)
  const normalizedOriginalTitle = normalizeCandidateTitle(input.originalTitle)
  return (
    normalizeCandidateTitle(candidate.title) === normalizedTitle
    || (
      normalizedOriginalTitle.length > 0
      && normalizeCandidateTitle(candidate.originalTitle) === normalizedOriginalTitle
    )
  )
}

export function pickConfidentMetadataMatch<TCandidate extends MediaTitleCandidate>(
  candidates: TCandidate[],
  input: MetadataMatchInput,
) {
  return explainMetadataMatch(candidates, input).candidate
}

export function explainMetadataMatch<TCandidate extends MediaTitleCandidate>(
  candidates: TCandidate[],
  input: MetadataMatchInput,
): { candidate: TCandidate; issue: null } | { candidate: null; issue: MetadataIssueCode } {
  const releaseYear = Number(input.releaseYear)
  const hasReleaseYear = input.releaseYear.trim().length > 0 && Number.isInteger(releaseYear)
  const titleMatches = candidates.filter((candidate) => hasExactMetadataTitle(candidate, input))
  if (titleMatches.length === 0) return { candidate: null, issue: "title-mismatch" }
  const exactMatches = hasReleaseYear
    ? titleMatches.filter((candidate) => candidate.releaseYear === releaseYear)
    : titleMatches

  if (exactMatches.length === 0) return { candidate: null, issue: "year-mismatch" }
  if (exactMatches.length > 1) {
    const platformCode = input.platformCode
    if (platformCode) {
      const platformMatches = exactMatches.filter((candidate) =>
        candidateMatchesPlatform(candidate, platformCode))
      if (platformMatches.length === 1) return { candidate: platformMatches[0], issue: null }
    }
    return { candidate: null, issue: "ambiguous-match" }
  }
  return { candidate: exactMatches[0], issue: null }
}

export function rankMetadataRefreshCandidates(
  candidates: SignedMediaTitleCandidate[],
  input: {
    originalTitle: string;
    releaseYear: string;
    title: string;
  },
) {
  const normalizedTitle = normalizeCandidateTitle(input.title);
  const normalizedOriginalTitle = normalizeCandidateTitle(input.originalTitle);
  const releaseYear = Number(input.releaseYear);
  const hasOriginalTitle = normalizedOriginalTitle.length > 0;
  const hasReleaseYear = input.releaseYear.trim().length > 0 && Number.isInteger(releaseYear);
  const rankedCandidates = [
    ...candidates.filter(
      (candidate) =>
        hasReleaseYear &&
        candidate.releaseYear === releaseYear &&
        (normalizeCandidateTitle(candidate.title) === normalizedTitle ||
          (hasOriginalTitle &&
            normalizeCandidateTitle(candidate.originalTitle) === normalizedOriginalTitle)),
    ),
    ...candidates.filter(
      (candidate) =>
        normalizeCandidateTitle(candidate.title) === normalizedTitle ||
        (hasOriginalTitle &&
          normalizeCandidateTitle(candidate.originalTitle) === normalizedOriginalTitle),
    ),
    ...candidates.filter((candidate) => hasReleaseYear && candidate.releaseYear === releaseYear),
    ...candidates,
  ];
  const seen = new Set<string>();

  return rankedCandidates.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.externalId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
