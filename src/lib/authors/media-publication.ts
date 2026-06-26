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

export function canAuthorCreateFranchise(input: {
  canPublishMediaWithoutReview: boolean;
}) {
  return input.canPublishMediaWithoutReview;
}

export function getAuthorMediaPublicationConfirmDescription(input: {
  canPublishMediaWithoutReview: boolean;
  title: string;
}) {
  if (input.canPublishMediaWithoutReview) {
    return `Запись «${input.title}» сразу попадет в общую базу и пропадет из черновиков. После этого ты уже не сможешь ее редактировать или удалить из предложений.`;
  }

  return `Если администратор одобрит «${input.title}», запись попадет в общую базу и пропадет из черновиков. После этого ты уже не сможешь ее редактировать или удалить из предложений.`;
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
