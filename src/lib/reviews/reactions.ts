export const REVIEW_REACTION_TYPES = ["like"] as const;

export type ReviewReactionType = (typeof REVIEW_REACTION_TYPES)[number];

export type ReviewReactionSummary = Record<
  ReviewReactionType,
  {
    count: number;
    reactedByCurrentUser: boolean;
  }
>;

export type ReviewReactionCounts = Record<ReviewReactionType, number>;

export function isReviewReactionType(value: string): value is ReviewReactionType {
  return REVIEW_REACTION_TYPES.some((type) => type === value);
}

export function emptyReviewReactionSummary(): ReviewReactionSummary {
  return {
    like: {
      count: 0,
      reactedByCurrentUser: false,
    },
  };
}

export function emptyReviewReactionCounts(): ReviewReactionCounts {
  return { like: 0 };
}
