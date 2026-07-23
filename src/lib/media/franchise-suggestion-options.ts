import type { PublicationStatus } from "@/lib/media/publication-status";

type FranchiseLinkStatus = {
  id: number;
  publicationStatus: PublicationStatus;
};

export function mapFranchiseSuggestionOptions<T extends { id: number }>(
  franchises: T[],
  franchiseLinkStatuses: FranchiseLinkStatus[],
) {
  const linkStatusById = new Map(
    franchiseLinkStatuses.map((franchise) => [
      franchise.id,
      franchise.publicationStatus,
    ]),
  );

  return franchises.map((franchise) => {
    const linkStatus = linkStatusById.get(franchise.id);

    return {
      ...franchise,
      disabled: linkStatus !== undefined,
      disabledLabel:
        linkStatus === "published"
          ? "Уже привязана к записи"
          : linkStatus === "submitted"
            ? "Уже предложена и ожидает проверки"
            : linkStatus === "rejected"
              ? "Привязка отклонена"
              : linkStatus === "private"
                ? "Связь ещё не отправлена"
                : undefined,
    };
  });
}
