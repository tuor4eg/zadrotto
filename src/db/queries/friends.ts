import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { containsNormalizedSearchSql } from "@/db/search";
import { getAuthorPublishedMediaItemCount } from "@/db/queries/media-items";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import {
  authorFriendships,
  authors,
  contributionReviews,
  contributions,
  mediaItems,
  ratings,
} from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { clampArchiveListPageSize } from "@/lib/archive/tile-grid-capacity";
import { FRIENDS_PAGE_SIZE, type FriendshipViewState } from "@/lib/friends/model";
import { normalizeSearchText } from "@/lib/search/normalize";
import { runInDomainEventTransaction } from "@/db/transaction";

type UserListRow = {
  avatarObjectKey: string | null;
  id: number;
  name: string;
  relationState: FriendshipViewState;
};

type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function pair(authorId: number, otherAuthorId: number) {
  return authorId < otherAuthorId
    ? { firstAuthorId: authorId, secondAuthorId: otherAuthorId }
    : { firstAuthorId: otherAuthorId, secondAuthorId: authorId };
}

export async function getIncomingFriendRequestCount(authorId: number) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authorFriendships)
    .where(and(
      eq(authorFriendships.status, "pending"),
      ne(authorFriendships.requestedByAuthorId, authorId),
      or(
        eq(authorFriendships.firstAuthorId, authorId),
        eq(authorFriendships.secondAuthorId, authorId),
      ),
    ));
  return result?.count ?? 0;
}

export async function getFriendshipViewState(
  currentAuthorId: number | null | undefined,
  profileAuthorId: number,
): Promise<FriendshipViewState> {
  if (!currentAuthorId) return "none";
  if (currentAuthorId === profileAuthorId) return "self";
  const ids = pair(currentAuthorId, profileAuthorId);
  const [relation] = await db
    .select({ requestedByAuthorId: authorFriendships.requestedByAuthorId, status: authorFriendships.status })
    .from(authorFriendships)
    .where(and(
      eq(authorFriendships.firstAuthorId, ids.firstAuthorId),
      eq(authorFriendships.secondAuthorId, ids.secondAuthorId),
    ))
    .limit(1);
  if (!relation) return "none";
  if (relation.status === "accepted") return "friends";
  return relation.requestedByAuthorId === currentAuthorId ? "outgoing" : "incoming";
}

export async function getPublicUserProfile(
  profileAuthorId: number,
  currentAuthorId?: number | null,
  isAdmin = false,
) {
  const [author] = await db
    .select({
      avatarObjectKey: authors.avatarObjectKey,
      id: authors.id,
      isDiscoverable: authors.isDiscoverable,
      name: authors.name,
    })
    .from(authors)
    .where(and(eq(authors.id, profileAuthorId), eq(authors.isSystem, false), isNull(authors.blockedAt)))
    .limit(1);
  if (!author) return null;
  const relationState = await getFriendshipViewState(currentAuthorId, profileAuthorId);
  if (!author.isDiscoverable && relationState !== "self" && relationState !== "friends" && !isAdmin) return null;
  return {
    ...author,
    relationState,
    canViewJournal: relationState === "self" || relationState === "friends" || isAdmin,
  };
}

export async function updateAuthorDiscoverability(authorId: number, isDiscoverable: boolean) {
  const [updated] = await db
    .update(authors)
    .set({ isDiscoverable, updatedAt: new Date() })
    .where(and(eq(authors.id, authorId), eq(authors.isSystem, false), isNull(authors.blockedAt)))
    .returning({ id: authors.id });
  return Boolean(updated);
}

export type FriendshipMutationResult = "ok" | "not-found" | "conflict";

export async function sendFriendRequest(authorId: number, targetAuthorId: number): Promise<FriendshipMutationResult> {
  if (authorId === targetAuthorId) return "conflict";
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: authors.id })
      .from(authors)
      .where(and(
        eq(authors.id, targetAuthorId),
        eq(authors.isDiscoverable, true),
        eq(authors.isSystem, false),
        isNull(authors.blockedAt),
      ))
      .limit(1)
      .for("update");
    if (!target) return "not-found";
    const ids = pair(authorId, targetAuthorId);
    const inserted = await tx
      .insert(authorFriendships)
      .values({ ...ids, requestedByAuthorId: authorId, status: "pending" })
      .onConflictDoNothing({ target: [authorFriendships.firstAuthorId, authorFriendships.secondAuthorId] })
      .returning({ id: authorFriendships.id });
    return inserted.length ? "ok" : "conflict";
  });
}

export async function cancelFriendRequest(authorId: number, targetAuthorId: number) {
  const ids = pair(authorId, targetAuthorId);
  const deleted = await db.delete(authorFriendships).where(and(
    eq(authorFriendships.firstAuthorId, ids.firstAuthorId),
    eq(authorFriendships.secondAuthorId, ids.secondAuthorId),
    eq(authorFriendships.status, "pending"),
    eq(authorFriendships.requestedByAuthorId, authorId),
  )).returning({ id: authorFriendships.id });
  return deleted.length > 0;
}

export async function declineFriendRequest(authorId: number, requesterId: number) {
  const ids = pair(authorId, requesterId);
  const deleted = await db.delete(authorFriendships).where(and(
    eq(authorFriendships.firstAuthorId, ids.firstAuthorId),
    eq(authorFriendships.secondAuthorId, ids.secondAuthorId),
    eq(authorFriendships.status, "pending"),
    eq(authorFriendships.requestedByAuthorId, requesterId),
  )).returning({ id: authorFriendships.id });
  return deleted.length > 0;
}

export async function acceptFriendRequest(authorId: number, requesterId: number) {
  const ids = pair(authorId, requesterId);
  const now = new Date();
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const updated = await tx.update(authorFriendships).set({
      acceptedAt: now,
      status: "accepted",
      updatedAt: now,
    }).where(and(
      eq(authorFriendships.firstAuthorId, ids.firstAuthorId),
      eq(authorFriendships.secondAuthorId, ids.secondAuthorId),
      eq(authorFriendships.status, "pending"),
      eq(authorFriendships.requestedByAuthorId, requesterId),
    )).returning({ id: authorFriendships.id });
    const friendship = updated[0];

    if (!friendship) return false;

    await appendEvent({
      actorAuthorId: authorId,
      aggregateId: String(friendship.id),
      aggregateType: "friendship",
      payload: {
        acceptedByAuthorId: authorId,
        friendshipId: friendship.id,
        requestedByAuthorId: requesterId,
      },
      type: "friend.accepted",
    });

    return true;
  });
}

export async function removeFriend(authorId: number, friendId: number) {
  const ids = pair(authorId, friendId);
  const deleted = await db.delete(authorFriendships).where(and(
    eq(authorFriendships.firstAuthorId, ids.firstAuthorId),
    eq(authorFriendships.secondAuthorId, ids.secondAuthorId),
    eq(authorFriendships.status, "accepted"),
  )).returning({ id: authorFriendships.id });
  return deleted.length > 0;
}

type ListKind = "friends" | "incoming" | "outgoing";

export async function getFriendshipList(authorId: number, kind: ListKind, requestedPage: number): Promise<Paginated<UserListRow>> {
  const kindSql = kind === "friends"
    ? sql`f.status = 'accepted'`
    : kind === "incoming"
      ? sql`f.status = 'pending' and f.requested_by_author_id <> ${authorId}`
      : sql`f.status = 'pending' and f.requested_by_author_id = ${authorId}`;
  const commonSql = sql`(${authorId} = f.first_author_id or ${authorId} = f.second_author_id) and ${kindSql}`;
  const countRows = await db.execute<{ count: number }>(sql`
    select count(*)::int as "count" from author_friendships f where ${commonSql}
  `);
  const totalCount = countRows[0]?.count ?? 0;
  const totalPages = getTotalPages(totalCount, FRIENDS_PAGE_SIZE);
  const page = clampPage(requestedPage, totalPages);
  const rows = await db.execute<Omit<UserListRow, "relationState">>(sql`
    select a.id, a.name, a.avatar_object_key as "avatarObjectKey"
    from author_friendships f
    join authors a on a.id = case when f.first_author_id = ${authorId} then f.second_author_id else f.first_author_id end
    where ${commonSql}
    order by a.name asc, a.id asc
    limit ${FRIENDS_PAGE_SIZE} offset ${getOffset(page, FRIENDS_PAGE_SIZE)}
  `);
  const relationState: FriendshipViewState = kind === "friends" ? "friends" : kind === "incoming" ? "incoming" : "outgoing";
  return { items: rows.map((row) => ({ ...row, relationState })), page, pageSize: FRIENDS_PAGE_SIZE, totalCount, totalPages };
}

export async function searchDiscoverableUsers(authorId: number, query: string, requestedPage: number): Promise<Paginated<UserListRow>> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { items: [], page: 1, pageSize: FRIENDS_PAGE_SIZE, totalCount: 0, totalPages: 1 };
  const filter = and(
    ne(authors.id, authorId),
    eq(authors.isDiscoverable, true),
    eq(authors.isSystem, false),
    isNull(authors.blockedAt),
    containsNormalizedSearchSql(authors.name, normalizedQuery),
  );
  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(authors).where(filter);
  const totalCount = countRow?.count ?? 0;
  const totalPages = getTotalPages(totalCount, FRIENDS_PAGE_SIZE);
  const page = clampPage(requestedPage, totalPages);
  const rows = await db.select({ id: authors.id, name: authors.name, avatarObjectKey: authors.avatarObjectKey })
    .from(authors).where(filter).orderBy(authors.name, authors.id).limit(FRIENDS_PAGE_SIZE).offset(getOffset(page, FRIENDS_PAGE_SIZE));
  const relations = rows.length ? await db.select({
    firstAuthorId: authorFriendships.firstAuthorId,
    secondAuthorId: authorFriendships.secondAuthorId,
    requestedByAuthorId: authorFriendships.requestedByAuthorId,
    status: authorFriendships.status,
  }).from(authorFriendships).where(or(
    and(eq(authorFriendships.firstAuthorId, authorId), inArray(authorFriendships.secondAuthorId, rows.map((row) => row.id))),
    and(eq(authorFriendships.secondAuthorId, authorId), inArray(authorFriendships.firstAuthorId, rows.map((row) => row.id))),
  )) : [];
  const relationById = new Map(relations.map((relation) => {
    const otherId = relation.firstAuthorId === authorId ? relation.secondAuthorId : relation.firstAuthorId;
    const state: FriendshipViewState = relation.status === "accepted" ? "friends" : relation.requestedByAuthorId === authorId ? "outgoing" : "incoming";
    return [otherId, state];
  }));
  return { items: rows.map((row) => ({ ...row, relationState: relationById.get(row.id) ?? "none" })), page, pageSize: FRIENDS_PAGE_SIZE, totalCount, totalPages };
}

export async function getPublicRatingJournal(
  authorId: number,
  requestedPage: number,
  accessibleMediaTypeCodes: readonly string[],
  requestedPageSize: number,
) {
  const pageSize = clampArchiveListPageSize(requestedPageSize);
  const filter = and(
    eq(ratings.authorId, authorId),
    eq(mediaItems.publicationStatus, "published"),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
  );
  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(filter);
  const totalCount = countRow?.count ?? 0;
  const totalPages = getTotalPages(totalCount, pageSize);
  const page = clampPage(requestedPage, totalPages);
  const items = await db.select({ mediaItemId: mediaItems.id, code: mediaItems.code, title: mediaItems.title, score: ratings.score, updatedAt: ratings.updatedAt })
    .from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(filter)
    .orderBy(desc(ratings.updatedAt), desc(ratings.id)).limit(pageSize).offset(getOffset(page, pageSize));
  return { items, page, pageSize, totalCount, totalPages };
}

export async function getPublicReviewJournal(authorId: number, requestedPage: number, accessibleMediaTypeCodes: readonly string[]) {
  const filter = and(
    eq(contributions.authorId, authorId),
    eq(contributions.type, "review"),
    eq(contributions.status, "published"),
    eq(mediaItems.publicationStatus, "published"),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
  );
  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(contributions)
    .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId)).where(filter);
  const totalCount = countRow?.count ?? 0;
  const totalPages = getTotalPages(totalCount, FRIENDS_PAGE_SIZE);
  const page = clampPage(requestedPage, totalPages);
  const items = await db.select({
    id: contributions.id,
    code: mediaItems.code,
    mediaTitle: mediaItems.title,
    reviewTitle: contributionReviews.title,
    publishedAt: contributions.reviewedAt,
    updatedAt: contributions.updatedAt,
  }).from(contributions).innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
    .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId)).where(filter)
    .orderBy(desc(contributions.reviewedAt), desc(contributions.updatedAt), desc(contributions.id))
    .limit(FRIENDS_PAGE_SIZE).offset(getOffset(page, FRIENDS_PAGE_SIZE));
  return { items, page, pageSize: FRIENDS_PAGE_SIZE, totalCount, totalPages };
}

export async function getPublicAuthorStatistics(authorId: number, accessibleMediaTypeCodes: readonly string[]) {
  const currentMoscowYear = Number(new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", year: "numeric" }).format(new Date()));
  const ratingFilter = and(
    eq(ratings.authorId, authorId),
    eq(mediaItems.publicationStatus, "published"),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
  );
  const reviewFilter = and(
    eq(contributions.authorId, authorId),
    eq(contributions.type, "review"),
    eq(contributions.status, "published"),
    eq(mediaItems.publicationStatus, "published"),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, accessibleMediaTypeCodes),
  );
  const [totalRows, distribution, releaseYearDistribution, scoreDistribution, latestRatings, reviewCountRows, latestReviews, contributionCount] = await Promise.all([
    db.select({
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      currentYearRatingsCount: sql<number>`count(${ratings.id}) filter (where extract(year from ${ratings.createdAt} at time zone 'Europe/Moscow') = ${currentMoscowYear})::int`,
    }).from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(ratingFilter),
    db.select({ mediaType: mediaItems.mediaType, ratingsCount: sql<number>`count(${ratings.id})::int` })
      .from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(ratingFilter).groupBy(mediaItems.mediaType),
    db.select({ year: mediaItems.releaseYear, ratingsCount: sql<number>`count(${ratings.id})::int` })
      .from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(and(ratingFilter, sql`${mediaItems.releaseYear} is not null`))
      .groupBy(mediaItems.releaseYear).orderBy(mediaItems.releaseYear),
    db.select({ score: ratings.score, ratingsCount: sql<number>`count(${ratings.id})::int` })
      .from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(ratingFilter).groupBy(ratings.score),
    db.select({ mediaItemId: mediaItems.id, score: ratings.score })
      .from(ratings).innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId)).where(ratingFilter)
      .orderBy(desc(ratings.updatedAt), desc(ratings.id)).limit(5),
    db.select({ reviewsCount: sql<number>`count(${contributions.id})::int` })
      .from(contributions).innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
      .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId)).where(reviewFilter),
    db.select({ id: contributions.id, mediaItemId: mediaItems.id })
      .from(contributions).innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
      .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId)).where(reviewFilter)
      .orderBy(desc(contributions.reviewedAt), desc(contributions.updatedAt), desc(contributions.id)).limit(5),
    getAuthorPublishedMediaItemCount(authorId, accessibleMediaTypeCodes),
  ]);
  const totals = totalRows[0];
  return {
    ratingSummary: {
      ratingsCount: totals?.ratingsCount ?? 0,
      averageScore: totals?.averageScore ?? null,
      currentYearRatingsCount: totals?.currentYearRatingsCount ?? 0,
      distribution,
      releaseYearDistribution: releaseYearDistribution.flatMap((item) => item.year === null ? [] : [{ year: item.year, count: item.ratingsCount }]),
      scoreDistribution,
    },
    reviewCount: reviewCountRows[0]?.reviewsCount ?? 0,
    contributionCount,
    latestRatings,
    latestReviews,
  };
}
