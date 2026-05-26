import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authors,
  contributionMediaItems,
  contributionReviews,
  contributions,
  mediaItems,
} from "@/db/schema";
import {
  isAuthorEditableContributionStatus,
  PUBLISHED_CONTRIBUTION_STATUS,
  type ContributionStatus,
} from "@/lib/contributions";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/publication-status";

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

export async function getAuthorReviews(authorId: number) {
  return db
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
    .where(and(eq(contributions.authorId, authorId), eq(contributions.type, "review")))
    .orderBy(desc(contributions.updatedAt), desc(contributions.id));
}

export async function getAuthorReviewForEdit(authorId: number, contributionId: number) {
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

export async function searchPublishedMediaItemsForReview(query: string) {
  const normalizedQuery = query.trim();
  const condition = normalizedQuery
    ? and(
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        or(
          ilike(mediaItems.title, `%${normalizedQuery}%`),
          ilike(mediaItems.originalTitle, `%${normalizedQuery}%`),
          ilike(mediaItems.code, `%${normalizedQuery}%`),
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
    .where(condition)
    .orderBy(desc(mediaItems.updatedAt), desc(mediaItems.id))
    .limit(30);
}

export async function getPublishedMediaItemForReview(mediaItemId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .where(
      and(eq(mediaItems.id, mediaItemId), eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS)),
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
  status: Extract<ContributionStatus, "draft" | "submitted">;
}) {
  const now = new Date();
  const submittedAt = input.status === "submitted" ? now : null;

  return db.transaction(async (tx) => {
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
          .limit(1);
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
          reviewedAt: null,
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

    return { ok: true as const, id: created.id };
  });
}

export async function getAdminContributionReviews(input: {
  status?: ContributionStatus | "all";
}) {
  const statusCondition =
    input.status && input.status !== "all"
      ? eq(contributions.status, input.status)
      : inArray(contributions.status, ["submitted", "published", "rejected", "hidden"]);

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
    .where(and(eq(contributions.type, "review"), statusCondition))
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
  return db.transaction(async (tx) => {
    const [review] = await tx
      .update(contributions)
      .set({
        status: input.decision,
        reviewedByAdminId: input.adminUserId,
        reviewedAt: now,
        adminNote: input.adminNote,
        updatedAt: now,
      })
      .where(
        and(
          eq(contributions.id, input.contributionId),
          eq(contributions.type, "review"),
          inArray(contributions.status, allowedStatuses),
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
      })
      .from(mediaItems)
      .where(eq(mediaItems.id, review.mediaItemId))
      .limit(1);

    return mediaItem ? { ...review, mediaItemCode: mediaItem.code } : null;
  });
}
