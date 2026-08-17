import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { containsNormalizedSearchSql } from "@/db/search";
import {
  authors,
  contributionMediaItems,
  contributionReviews,
  contributions,
  mediaItemTitleAliases,
  mediaItems,
} from "@/db/schema";
import {
  isAuthorEditableContributionStatus,
  PUBLISHED_CONTRIBUTION_STATUS,
  type ContributionStatus,
} from "@/lib/contributions/model";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { normalizeSearchText } from "@/lib/search/normalize";
import { runInDomainEventTransaction } from "@/db/transaction";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";

export async function getSubmittedContributionReviewCountForAdmin() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contributions)
    .where(and(eq(contributions.type, "review"), eq(contributions.status, "submitted")));

  return result?.count ?? 0;
}

export async function getPublishedReviewsForMediaItem(mediaItemId: number) {
  return db
    .select({
      id: contributions.id,
      authorName: authors.name,
      authorCode: authors.code,
      authorAvatarObjectKey: authors.avatarObjectKey,
      title: contributionReviews.title,
      body: contributionReviews.body,
      publishedAt: contributions.reviewedAt,
      updatedAt: contributions.updatedAt,
    })
    .from(contributionMediaItems)
    .innerJoin(contributions, eq(contributions.id, contributionMediaItems.contributionId))
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(authors, eq(authors.id, contributions.authorId))
    .where(
      and(
        eq(contributionMediaItems.mediaItemId, mediaItemId),
        eq(contributions.type, "review"),
        eq(contributions.status, PUBLISHED_CONTRIBUTION_STATUS),
      ),
    )
    .orderBy(desc(contributions.reviewedAt), desc(contributions.updatedAt), desc(contributions.id));
}

export async function getAuthorReviews(
  authorId: number,
  enabledMediaTypeCodes: readonly string[],
  requestedPage: number,
  pageSize: number,
) {
  const filter = and(
    eq(contributions.authorId, authorId),
    eq(contributions.type, "review"),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
  );
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(filter);
  const totalCount = countRow?.count ?? 0;
  const totalPages = getTotalPages(totalCount, pageSize);
  const page = clampPage(requestedPage, totalPages);
  const items = await db
    .select({
      id: contributions.id,
      status: contributions.status,
      adminNote: contributions.adminNote,
      submittedAt: contributions.submittedAt,
      reviewedAt: contributions.reviewedAt,
      updatedAt: contributions.updatedAt,
      mediaItemId: mediaItems.id,
      mediaItemCode: mediaItems.code,
      mediaItemTitle: mediaItems.title,
      reviewTitle: contributionReviews.title,
    })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(filter)
    .orderBy(desc(contributions.updatedAt), desc(contributions.id))
    .limit(pageSize)
    .offset(getOffset(page, pageSize));

  return { items, page, pageSize, totalCount, totalPages };
}

export async function getAuthorReviewSummary(
  authorId: number,
  enabledMediaTypeCodes: readonly string[],
) {
  const [statusCounts, latestReviews] = await Promise.all([
    db
      .select({
        status: contributions.status,
        reviewsCount: sql<number>`count(${contributions.id})::int`,
      })
      .from(contributions)
      .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
      .where(and(
        eq(contributions.authorId, authorId),
        eq(contributions.type, "review"),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(contributions.status),
    db
      .select({
        id: contributions.id,
        status: contributions.status,
        updatedAt: contributions.updatedAt,
        mediaItemId: mediaItems.id,
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        reviewTitle: contributionReviews.title,
      })
      .from(contributions)
      .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
      .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
      .where(and(
        eq(contributions.authorId, authorId),
        eq(contributions.type, "review"),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .orderBy(desc(contributions.updatedAt), desc(contributions.id))
      .limit(5),
  ]);

  const reviewsCount = statusCounts.reduce((total, item) => total + item.reviewsCount, 0);

  return {
    reviewsCount,
    statusCounts,
    latestReviews,
  };
}

export async function getAuthorReviewForEdit(
  authorId: number,
  contributionId: number,
  accessibleMediaTypeCodes: readonly string[],
) {
  const [review] = await db
    .select({
      id: contributions.id,
      status: contributions.status,
      adminNote: contributions.adminNote,
      mediaItemId: mediaItems.id,
      mediaItemCode: mediaItems.code,
      mediaItemTitle: mediaItems.title,
      title: contributionReviews.title,
      body: contributionReviews.body,
    })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(
      and(
        eq(contributions.id, contributionId),
        eq(contributions.authorId, authorId),
        eq(contributions.type, "review"),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
      ),
    )
    .limit(1);

  return review ?? null;
}

export async function getAuthorReviewForMediaItem(authorId: number, mediaItemId: number) {
  const [review] = await db
    .select({
      id: contributions.id,
      status: contributions.status,
    })
    .from(contributions)
    .where(
      and(
        eq(contributions.authorId, authorId),
        eq(contributions.primaryMediaItemId, mediaItemId),
        eq(contributions.type, "review"),
      ),
    )
    .limit(1);

  return review ?? null;
}

export async function searchPublishedMediaItemsForReview(
  query: string,
  enabledMediaTypeCodes: readonly string[],
) {
  const normalizedQuery = normalizeSearchText(query);
  const condition = normalizedQuery
    ? and(
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        or(
          containsNormalizedSearchSql(mediaItems.title, normalizedQuery),
          containsNormalizedSearchSql(mediaItems.originalTitle, normalizedQuery),
          containsNormalizedSearchSql(mediaItems.code, normalizedQuery),
          exists(
            db
              .select({ id: mediaItemTitleAliases.id })
              .from(mediaItemTitleAliases)
              .where(
                and(
                  eq(mediaItemTitleAliases.mediaItemId, mediaItems.id),
                  containsNormalizedSearchSql(mediaItemTitleAliases.value, normalizedQuery),
                ),
              ),
          ),
        ),
      )
    : eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS);

  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      releaseYear: mediaItems.releaseYear,
    })
    .from(mediaItems)
    .where(and(
      condition,
      getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
    ))
    .orderBy(desc(mediaItems.updatedAt), desc(mediaItems.id))
    .limit(30);
}

export async function getPublishedMediaItemForReview(
  mediaItemId: number,
  accessibleMediaTypeCodes: readonly string[],
) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.id, mediaItemId),
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
      ),
    )
    .limit(1);

  return item ?? null;
}

export async function upsertAuthorReview(input: {
  authorId: number;
  contributionId?: number | null;
  mediaItemId: number;
  title: string;
  body: string;
  status: Extract<ContributionStatus, "draft" | "published" | "submitted">;
}) {
  const now = new Date();
  const submittedAt = input.status === "submitted" ? now : null;
  const reviewedAt = input.status === "published" ? now : null;

  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const existingReview = input.contributionId
      ? await tx
          .select({
            id: contributions.id,
            status: contributions.status,
            mediaItemId: contributions.primaryMediaItemId,
          })
          .from(contributions)
          .where(
            and(
              eq(contributions.id, input.contributionId),
              eq(contributions.authorId, input.authorId),
              eq(contributions.type, "review"),
            ),
          )
          .limit(1)
          .for("update")
      : await tx
          .select({
            id: contributions.id,
            status: contributions.status,
            mediaItemId: contributions.primaryMediaItemId,
          })
          .from(contributions)
          .where(
            and(
              eq(contributions.authorId, input.authorId),
              eq(contributions.primaryMediaItemId, input.mediaItemId),
              eq(contributions.type, "review"),
            ),
          )
          .limit(1)
          .for("update");
    const existing = existingReview[0];

    if (existing && !isAuthorEditableContributionStatus(existing.status)) {
      return { ok: false as const, reason: "locked" as const };
    }

    if (existing && existing.mediaItemId !== input.mediaItemId) {
      return { ok: false as const, reason: "not-found" as const };
    }

    if (existing) {
      await tx
        .update(contributions)
        .set({
          status: input.status,
          submittedAt,
          reviewedByAdminId: null,
          reviewedAt,
          adminNote: null,
          updatedAt: now,
        })
        .where(eq(contributions.id, existing.id));
      await tx
        .update(contributionReviews)
        .set({
          title: input.title,
          body: input.body,
        })
        .where(eq(contributionReviews.contributionId, existing.id));

      if (input.status === "published" && existing.status !== "published") {
        await appendEvent({
          actorAuthorId: input.authorId,
          aggregateId: String(existing.id),
          aggregateType: "review",
          payload: { authorId: input.authorId, mediaItemId: input.mediaItemId },
          type: "review.published",
        });
      }

      if (input.status === "submitted" && existing.status !== "submitted") {
        await appendEvent({
          actorAuthorId: input.authorId,
          aggregateId: String(existing.id),
          aggregateType: "review",
          payload: {
            authorId: input.authorId,
            contributionId: existing.id,
            mediaItemId: input.mediaItemId,
          },
          type: "review.submitted",
        });
      }

      return { ok: true as const, id: existing.id };
    }

    const [created] = await tx
      .insert(contributions)
      .values({
        type: "review",
        authorId: input.authorId,
        primaryMediaItemId: input.mediaItemId,
        status: input.status,
        submittedAt,
        reviewedAt,
        updatedAt: now,
      })
      .returning({ id: contributions.id });

    if (!created) {
      return { ok: false as const, reason: "not-found" as const };
    }

    await tx.insert(contributionReviews).values({
      contributionId: created.id,
      title: input.title,
      body: input.body,
    });
    await tx.insert(contributionMediaItems).values({
      contributionId: created.id,
      mediaItemId: input.mediaItemId,
    });

    if (input.status === "published") {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: String(created.id),
        aggregateType: "review",
        payload: { authorId: input.authorId, mediaItemId: input.mediaItemId },
        type: "review.published",
      });
    }

    if (input.status === "submitted") {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: String(created.id),
        aggregateType: "review",
        payload: {
          authorId: input.authorId,
          contributionId: created.id,
          mediaItemId: input.mediaItemId,
        },
        type: "review.submitted",
      });
    }

    return { ok: true as const, id: created.id };
  });
}

export async function getAdminContributionReviews(input: {
  authorId?: number | null;
  status?: ContributionStatus | "all";
}) {
  const statusCondition =
    input.status && input.status !== "all"
      ? eq(contributions.status, input.status)
      : inArray(contributions.status, ["submitted", "published", "rejected", "hidden"]);
  const authorCondition = input.authorId ? eq(contributions.authorId, input.authorId) : undefined;

  return db
    .select({
      id: contributions.id,
      status: contributions.status,
      submittedAt: contributions.submittedAt,
      reviewedAt: contributions.reviewedAt,
      updatedAt: contributions.updatedAt,
      adminNote: contributions.adminNote,
      authorId: authors.id,
      authorName: authors.name,
      mediaItemCode: mediaItems.code,
      mediaItemTitle: mediaItems.title,
      reviewTitle: contributionReviews.title,
      reviewBody: contributionReviews.body,
    })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(authors, eq(authors.id, contributions.authorId))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(and(eq(contributions.type, "review"), statusCondition, authorCondition))
    .orderBy(desc(contributions.submittedAt), desc(contributions.updatedAt), desc(contributions.id));
}

export async function getSubmittedContributionReviewForAdminView(contributionId: number) {
  const [review] = await db
    .select({
      id: contributions.id,
      status: contributions.status,
      submittedAt: contributions.submittedAt,
      updatedAt: contributions.updatedAt,
      authorId: authors.id,
      authorName: authors.name,
      mediaItemCode: mediaItems.code,
      mediaItemTitle: mediaItems.title,
      reviewTitle: contributionReviews.title,
      reviewBody: contributionReviews.body,
    })
    .from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(authors, eq(authors.id, contributions.authorId))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
    .where(
      and(
        eq(contributions.id, contributionId),
        eq(contributions.type, "review"),
        eq(contributions.status, "submitted"),
      ),
    )
    .limit(1);

  return review ?? null;
}

export async function reviewContributionReview(input: {
  contributionId: number;
  adminUserId: number;
  decision: Extract<ContributionStatus, "published" | "rejected" | "hidden">;
  adminNote: string | null;
}) {
  const now = new Date();
  const allowedStatuses: ContributionStatus[] =
    input.decision === "hidden"
      ? ["published"]
      : input.decision === "published"
        ? ["submitted", "hidden", "rejected"]
        : ["submitted"];
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [previous] = await tx
      .select({
        authorId: contributions.authorId,
        id: contributions.id,
        mediaItemId: contributions.primaryMediaItemId,
        status: contributions.status,
      })
      .from(contributions)
      .where(
        and(
          eq(contributions.id, input.contributionId),
          eq(contributions.type, "review"),
          inArray(contributions.status, allowedStatuses),
        ),
      )
      .limit(1)
      .for("update");

    if (!previous) {
      return null;
    }

    const [review] = await tx
      .update(contributions)
      .set({
        status: input.decision,
        reviewedByAdminId: input.adminUserId,
        reviewedAt: now,
        adminNote: input.adminNote,
        updatedAt: now,
      })
      .where(eq(contributions.id, previous.id))
      .returning({
        authorId: contributions.authorId,
        id: contributions.id,
        mediaItemId: contributions.primaryMediaItemId,
      });

    if (!review) {
      return null;
    }

    if (input.decision === "published") {
      await appendEvent({
        actorAuthorId: null,
        aggregateId: String(review.id),
        aggregateType: "review",
        payload: { authorId: review.authorId, mediaItemId: review.mediaItemId },
        type: "review.published",
      });
      if (previous.status === "submitted") {
        await appendEvent({
          actorAuthorId: null,
          aggregateId: String(review.id),
          aggregateType: "review",
          payload: {
            authorId: review.authorId,
            contributionId: review.id,
            mediaItemId: review.mediaItemId,
          },
          type: "review.approved",
        });
      }
    }

    const [mediaItem] = await tx
      .select({
        code: mediaItems.code,
        title: mediaItems.title,
      })
      .from(mediaItems)
      .where(eq(mediaItems.id, review.mediaItemId))
      .limit(1);

    return mediaItem
      ? { ...review, mediaItemCode: mediaItem.code, mediaItemTitle: mediaItem.title }
      : null;
  });
}

export async function deleteHiddenContributionReview(contributionId: number) {
  return db.transaction(async (tx) => {
    const [review] = await tx
      .delete(contributions)
      .where(
        and(
          eq(contributions.id, contributionId),
          eq(contributions.type, "review"),
          eq(contributions.status, "hidden"),
        ),
      )
      .returning({
        id: contributions.id,
        mediaItemId: contributions.primaryMediaItemId,
      });

    if (!review) {
      return null;
    }

    const [mediaItem] = await tx
      .select({
        code: mediaItems.code,
        title: mediaItems.title,
      })
      .from(mediaItems)
      .where(eq(mediaItems.id, review.mediaItemId))
      .limit(1);

    return mediaItem
      ? { ...review, mediaItemCode: mediaItem.code, mediaItemTitle: mediaItem.title }
      : null;
  });
}
