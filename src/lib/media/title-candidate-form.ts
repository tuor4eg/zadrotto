import type { MediaTitleCandidate } from "@/lib/covers/types";

type MediaTitleFormFields = {
  description: string;
  originalTitle: string;
  releaseYear: string;
  title: string;
};

export function getMediaTitleCandidateFormFields(
  candidate: MediaTitleCandidate,
  current: MediaTitleFormFields,
  preserveExisting: boolean,
): MediaTitleFormFields {
  const candidateFields = {
    title: candidate.title,
    originalTitle: candidate.originalTitle ?? "",
    releaseYear: candidate.releaseYear ? String(candidate.releaseYear) : "",
    description: candidate.description ?? "",
  };

  if (!preserveExisting) {
    return candidateFields;
  }

  return {
    title: current.title.trim() ? current.title : candidateFields.title,
    originalTitle: current.originalTitle.trim()
      ? current.originalTitle
      : candidateFields.originalTitle,
    releaseYear: current.releaseYear.trim() ? current.releaseYear : candidateFields.releaseYear,
    description: current.description.trim() ? current.description : candidateFields.description,
  };
}
