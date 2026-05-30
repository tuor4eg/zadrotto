export const PUBLICATION_STATUSES = [
  "private",
  "submitted",
  "published",
  "rejected",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLISHED_PUBLICATION_STATUS: PublicationStatus = "published";

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  private: "Черновики",
  submitted: "На проверке",
  published: "Опубликованные",
  rejected: "Отклоненные",
};

export const PUBLICATION_STATUS_VALUE_LABELS: Record<PublicationStatus, string> = {
  private: "Черновик",
  submitted: "На проверке",
  published: "Опубликована",
  rejected: "Отклонена",
};
