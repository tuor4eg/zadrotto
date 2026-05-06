import {
  PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION,
  type AuthorPermission,
} from "@/lib/author-permissions";
import type { PublicationStatus } from "@/lib/publication-status";

export type AuthorPublicationSubmitStatus = Extract<
  PublicationStatus,
  "submitted" | "published"
>;

export function getPublicationStatusAfterAuthorSubmit(
  permissions: Iterable<AuthorPermission>,
): AuthorPublicationSubmitStatus {
  const permissionSet = permissions instanceof Set ? permissions : new Set(permissions);

  return permissionSet.has(PUBLISH_MEDIA_WITHOUT_REVIEW_PERMISSION) ? "published" : "submitted";
}

export function canAuthorRequestPublication(status: PublicationStatus) {
  return status === "private" || status === "rejected";
}
