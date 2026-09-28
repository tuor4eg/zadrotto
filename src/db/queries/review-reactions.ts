import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { contributionReviews, contributions, mediaItems, reviewReactions } from "@/db/schema";
import { PUBLISHED_CONTRIBUTION_STATUS } from "@/lib/contributions/model";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import {
  emptyReviewReactionSummary,
  type ReviewReactionSummary,
  type ReviewReactionType,
} from "@/lib/reviews/reactions";

type ReactionMutationResult =
  | { kind: "success"; reactions: ReviewReactionSummary }
  | { kind: "forbidden" }
  | { kind: "not-found" };

export function reviewReactionCountSql(reviewId: typeof contributions.id, type: ReviewReactionType) {
  return sql<number>`(
    select count(*)::int
    from ${reviewReactions}
    where ${reviewReactions.reviewId} = ${reviewId}
      and ${reviewReactions.type} = ${type}
  )`;
}

export function currentUserReviewReactionExistsSql(
  reviewId: typeof contributions.id,
  userId: number | null,
  type: ReviewReactionType,
) {
  if (userId === null) return sql<boolean>`false`;

  return sql<boolean>`exists (
    select 1
    from ${reviewReactions}
    where ${reviewReactions.reviewId} = ${reviewId}
      and ${reviewReactions.type} = ${type}
      and ${reviewReactions.userId} = ${userId}
  )`;
}

function mapReactionSummary(row: { likeCount: number; likedByCurrentUser: boolean } | undefined) {
  if (!row) return emptyReviewReactionSummary();

  return {
    like: {
      count: row.likeCount,
      reactedByCurrentUser: row.likedByCurrentUser,
    },
  } satisfies ReviewReactionSummary;
}

async function getReactionTarget(
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
  reviewId: number,
  accessibleMediaTypeCodes: readonly string[],
) {
  if (accessibleMediaTypeCodes.length === 0) return null;

  const [target] = await executor
    .select({ authorId: contributions.authorId })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(and(
      eq(contributions.id, reviewId),
      eq(contributions.type, "review"),
      eq(contributions.status, PUBLISHED_CONTRIBUTION_STATUS),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      inArray(mediaItems.mediaType, [...accessibleMediaTypeCodes]),
    ))
    .limit(1);

  return target ?? null;
}

async function getReactionSummaryInTransaction(
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
  reviewId: number,
  userId: number | null,
) {
  const [row] = await executor
    .select({
      likeCount: sql<number>`count(*) filter (where ${reviewReactions.type} = 'like')::int`,
      likedByCurrentUser: userId === null
        ? sql<boolean>`false`
        : sql<boolean>`coalesce(bool_or(
            ${reviewReactions.type} = 'like' and ${reviewReactions.userId} = ${userId}
          ), false)`,
    })
    .from(reviewReactions)
    .where(eq(reviewReactions.reviewId, reviewId));

  return mapReactionSummary(row);
}

export async function getPublishedReviewReactionSummary(input: {
  accessibleMediaTypeCodes: readonly string[];
  reviewId: number;
  userId: number | null;
}) {
  return db.transaction(async (tx) => {
    const target = await getReactionTarget(tx, input.reviewId, input.accessibleMediaTypeCodes);
    if (!target) return { kind: "not-found" } as const;

    return {
      kind: "success",
      reactions: await getReactionSummaryInTransaction(tx, input.reviewId, input.userId),
    } as const;
  });
}

export async function addPublishedReviewReaction(input: {
  accessibleMediaTypeCodes: readonly string[];
  reviewId: number;
  type: ReviewReactionType;
  userId: number;
}): Promise<ReactionMutationResult> {
  return db.transaction(async (tx) => {
    const target = await getReactionTarget(tx, input.reviewId, input.accessibleMediaTypeCodes);
    if (!target) return { kind: "not-found" };
    if (target.authorId === input.userId) return { kind: "forbidden" };

    await tx
      .insert(reviewReactions)
      .values({ reviewId: input.reviewId, type: input.type, userId: input.userId })
      .onConflictDoNothing();

    return {
      kind: "success",
      reactions: await getReactionSummaryInTransaction(tx, input.reviewId, input.userId),
    };
  });
}

export async function removePublishedReviewReaction(input: {
  accessibleMediaTypeCodes: readonly string[];
  reviewId: number;
  type: ReviewReactionType;
  userId: number;
}): Promise<ReactionMutationResult> {
  return db.transaction(async (tx) => {
    const target = await getReactionTarget(tx, input.reviewId, input.accessibleMediaTypeCodes);
    if (!target) return { kind: "not-found" };
    if (target.authorId === input.userId) return { kind: "forbidden" };

    await tx.delete(reviewReactions).where(and(
      eq(reviewReactions.reviewId, input.reviewId),
      eq(reviewReactions.type, input.type),
      eq(reviewReactions.userId, input.userId),
    ));

    return {
      kind: "success",
      reactions: await getReactionSummaryInTransaction(tx, input.reviewId, input.userId),
    };
  });
}
