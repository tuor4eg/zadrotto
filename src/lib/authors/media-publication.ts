import type { PublicationStatus } from "@/lib/media/publication-status";

export type AuthorPublicationSubmitStatus = Extract<
  PublicationStatus,
  "submitted" | "published"
>;

export function getPublicationStatusAfterAuthorSubmit(input: {
  canPublishMediaWithoutReview: boolean;
}): AuthorPublicationSubmitStatus {
  return input.canPublishMediaWithoutReview ? "published" : "submitted";
}

export function canAuthorRequestPublication(status: PublicationStatus) {
  return status === "private" || status === "rejected";
}

export function canAuthorWithdrawPublicationRequest(status: PublicationStatus) {
  return status === "submitted";
}

export function canAuthorDeleteMediaItem(status: PublicationStatus) {
  return status === "private" || status === "rejected";
}
