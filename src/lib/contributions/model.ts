export const CONTRIBUTION_TYPES = ["review"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const CONTRIBUTION_STATUSES = [
  "draft",
  "submitted",
  "published",
  "rejected",
  "hidden",
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const PUBLISHED_CONTRIBUTION_STATUS: ContributionStatus = "published";

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  draft: "Черновики",
  submitted: "На проверке",
  published: "Опубликованные",
  rejected: "Отклоненные",
  hidden: "Скрытые",
};

export const CONTRIBUTION_STATUS_VALUE_LABELS: Record<ContributionStatus, string> = {
  draft: "Черновик",
  submitted: "На проверке",
  published: "Опубликована",
  rejected: "Отклонена",
  hidden: "Скрыта",
};

export const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  review: "Рецензия",
};

export function isAuthorEditableContributionStatus(status: ContributionStatus) {
  return status === "draft" || status === "published" || status === "rejected" || status === "hidden";
}

export function isAdminReviewableContributionStatus(status: ContributionStatus) {
  return status === "submitted" || status === "published";
}
