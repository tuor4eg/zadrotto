import type { PublicationStatus } from "@/lib/media/publication-status";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

export type RelatedFranchiseSource = {
  id: number;
  code: string;
  title: string;
  publicationStatus: PublicationStatus;
  path?: Array<{ id: number; code: string; title: string }>;
};

type RelatedFranchiseSectionSource = {
  franchise: Pick<RelatedFranchiseSource, "id" | "code" | "title">;
  includeDescendants: boolean;
};

export function getRelatedFranchiseSectionSources(
  franchises: RelatedFranchiseSource[],
): RelatedFranchiseSectionSource[] {
  const directFranchises = franchises.filter(
    (franchise) => franchise.publicationStatus === PUBLISHED_PUBLICATION_STATUS,
  );
  const directFranchiseIds = new Set(directFranchises.map((franchise) => franchise.id));
  const ancestorsById = new Map<
    number,
    {
      franchise: RelatedFranchiseSectionSource["franchise"];
      depth: number;
      firstAppearance: number;
    }
  >();
  let firstAppearance = 0;

  for (const franchise of directFranchises) {
    const path = franchise.path ?? [];

    for (let index = path.length - 1; index >= 0; index -= 1) {
      const ancestor = path[index];

      if (directFranchiseIds.has(ancestor.id)) {
        continue;
      }

      const depth = path.length - index - 1;
      const existing = ancestorsById.get(ancestor.id);

      if (existing) {
        existing.depth = Math.min(existing.depth, depth);
        continue;
      }

      ancestorsById.set(ancestor.id, {
        franchise: ancestor,
        depth,
        firstAppearance,
      });
      firstAppearance += 1;
    }
  }

  const ancestorFranchises = [...ancestorsById.values()]
    .sort((left, right) => left.depth - right.depth || left.firstAppearance - right.firstAppearance)
    .map(({ franchise }) => franchise);

  return [
    ...directFranchises.map((franchise) => ({
      franchise: { id: franchise.id, code: franchise.code, title: franchise.title },
      includeDescendants: false,
    })),
    ...ancestorFranchises.map((franchise) => ({
      franchise,
      includeDescendants: true,
    })),
  ];
}
