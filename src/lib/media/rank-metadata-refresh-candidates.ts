import type { MediaTitleCandidate, SignedMediaTitleCandidate } from "@/lib/covers/types"
import { normalizeSearchText } from "@/lib/search/normalize"

function normalizeCandidateTitle(value: string | null | undefined) {
  return normalizeSearchText(value ?? "")
}

export type MetadataMatchInput = {
  originalTitle: string
  releaseYear: string
  title: string
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
  const releaseYear = Number(input.releaseYear)
  const hasReleaseYear = input.releaseYear.trim().length > 0 && Number.isInteger(releaseYear)
  const exactMatches = candidates.filter((candidate) => {
    if (!hasExactMetadataTitle(candidate, input)) return false
    if (hasReleaseYear && candidate.releaseYear !== releaseYear) return false
    return true
  })

  if (exactMatches.length !== 1) return null
  return exactMatches[0]
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
