import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorMediaStatuses,
  contributionMediaItems,
  contributionReviews,
  contributions,
  mediaCarriers,
  mediaItemMetadata,
  mediaItems,
  mediaTypes,
  ratings,
} from "@/db/schema";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { PUBLISHED_CONTRIBUTION_STATUS } from "@/lib/contributions/model";
import { resolveCoverUrl } from "@/lib/services/minio";
import { parseDailyDossierMinAverageScore } from "@/lib/main-page/daily-dossier-settings";
import {
  getRotatedMediaTypeCodes,
  parseTopArchiveMinAverageScore,
  parseTopArchiveMinRatingsCount,
  roundRobinMediaTypeItems,
} from "@/lib/main-page/top-archive-settings";

const SECTION_SIZES = {
  top: 12,
  newItems: 12,
  reviews: 12,
  latestRatings: 12,
  wanted: 12,
} as const;

export type MainPageMediaItem = {
  averageScore: number | null;
  code: string;
  coverThumbUrl: string | null;
  coverUrl: string | null;
  currentAuthorScore: number | null;
  id: number;
  mediaCarrierCode: string | null;
  mediaType: string;
  metadataFacts: Record<string, unknown> | null;
  ratingsCount: number;
  releaseYear: number | null;
  reviewId?: number | null;
  title: string;
};

export type MainPageSectionKey = keyof typeof SECTION_SIZES;

const globalDailyDossierCondition = and(
  eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
  eq(mediaTypes.isPubliclyAvailable, true),
  eq(mediaTypes.isAvailableToGuests, true),
  eq(mediaTypes.enabledByDefault, true),
);

export function createMainPageDataPromises(input: {
  currentAuthorId?: number;
  enabledMediaTypeCodes: readonly string[];
  topArchiveMinAverageScore: number;
  topArchiveMinRatingsCount: number;
  utcDate?: Date;
}) {
  const { currentAuthorId, enabledMediaTypeCodes } = input;
  const topArchiveMinAverageScore = parseTopArchiveMinAverageScore(
    input.topArchiveMinAverageScore,
  );
  const topArchiveMinRatingsCount = parseTopArchiveMinRatingsCount(
    input.topArchiveMinRatingsCount,
  );

  if (topArchiveMinAverageScore === null || topArchiveMinRatingsCount === null) {
    throw new Error("Invalid top archive settings");
  }

  if (enabledMediaTypeCodes.length === 0) {
    return {
      about: Promise.resolve({ counts: [], totalCount: 0 }),
      latestRatings: Promise.resolve([]),
      newItems: Promise.resolve([]),
      reviews: Promise.resolve([]),
      top: Promise.resolve([]),
      wanted: Promise.resolve([]),
    };
  }

  const accessCondition = and(
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    inArray(mediaItems.mediaType, [...enabledMediaTypeCodes]),
  );
  const averageScoreSql = sql<number | null>`avg(${ratings.score})::float`;
  const ratingsCountSql = sql<number>`count(distinct ${ratings.id})::int`;
  const mediaItemSelection = {
    averageScore: averageScoreSql,
    code: mediaItems.code,
    coverThumbUrl: mediaItems.coverThumbUrl,
    coverUrl: mediaItems.coverUrl,
    currentAuthorScore: currentAuthorId
      ? sql<number | null>`max(${ratings.score}) filter (where ${ratings.authorId} = ${currentAuthorId})::int`
      : sql<number | null>`null`,
    id: mediaItems.id,
    mediaCarrierCode: mediaCarriers.code,
    mediaType: mediaItems.mediaType,
    metadataFacts: mediaItemMetadata.facts,
    ratingsCount: ratingsCountSql,
    releaseYear: mediaItems.releaseYear,
    title: mediaItems.title,
  };

  const createMediaItemsQuery = (extraCondition?: ReturnType<typeof eq>) => db
    .select(mediaItemSelection)
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(accessCondition, extraCondition))
    .groupBy(
      mediaItems.id,
      mediaCarriers.code,
      mediaItemMetadata.facts,
    );

  const topEligibilityCondition = and(
    topArchiveMinAverageScore > 0
      ? sql`${averageScoreSql} >= ${topArchiveMinAverageScore * 10}`
      : undefined,
    topArchiveMinRatingsCount > 0
      ? sql`${ratingsCountSql} >= ${topArchiveMinRatingsCount}`
      : undefined,
  );
  const rotatedMediaTypeCodes = getRotatedMediaTypeCodes(
    enabledMediaTypeCodes,
    input.utcDate ?? new Date(),
  );
  const topRowsPromise = Promise.all(
    rotatedMediaTypeCodes.map((mediaTypeCode) =>
      createMediaItemsQuery(eq(mediaItems.mediaType, mediaTypeCode))
        .having(topEligibilityCondition)
        .orderBy(
          sql`${averageScoreSql} desc nulls last`,
          sql`${ratingsCountSql} desc`,
          sql`lower(${mediaItems.title}) asc`,
          sql`${mediaItems.id} asc`,
        )
        .limit(SECTION_SIZES.top),
    ),
  ).then((groups) => roundRobinMediaTypeItems(groups, SECTION_SIZES.top));

  const resolveMediaItems = <T extends MainPageMediaItem>(rows: T[]) => rows.map((item) => ({
    ...item,
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
  const newItemsPromise = createMediaItemsQuery()
      .orderBy(
        sql`${mediaItems.createdAt} desc`,
        sql`${mediaItems.id} desc`,
      )
      .limit(SECTION_SIZES.newItems);
  const reviewsPromise = db
      .select({
        ...mediaItemSelection,
        reviewId: sql<number>`(
          array_agg(
            ${contributions.id}
            order by ${contributions.createdAt} desc, ${contributions.id} desc
          )
        )[1]::int`,
      })
      .from(mediaItems)
      .innerJoin(
        contributionMediaItems,
        eq(contributionMediaItems.mediaItemId, mediaItems.id),
      )
      .innerJoin(
        contributions,
        eq(contributions.id, contributionMediaItems.contributionId),
      )
      .innerJoin(
        contributionReviews,
        eq(contributionReviews.contributionId, contributions.id),
      )
      .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
      .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
      .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
      .where(and(
        accessCondition,
        eq(contributions.type, "review"),
        eq(contributions.status, PUBLISHED_CONTRIBUTION_STATUS),
      ))
      .groupBy(mediaItems.id, mediaCarriers.code, mediaItemMetadata.facts)
      .orderBy(
        sql`max(${contributions.createdAt}) desc`,
        sql`${mediaItems.id} desc`,
      )
      .limit(SECTION_SIZES.reviews);
  const latestRatingsPromise = currentAuthorId
      ? createMediaItemsQuery()
          .having(sql`count(${ratings.id}) filter (where ${ratings.authorId} = ${currentAuthorId}) > 0`)
          .orderBy(
            sql`max(${ratings.updatedAt}) filter (where ${ratings.authorId} = ${currentAuthorId}) desc`,
            sql`${mediaItems.id} desc`,
          )
          .limit(SECTION_SIZES.latestRatings)
      : Promise.resolve([]);
  const wantedPromise = currentAuthorId
      ? db
          .select(mediaItemSelection)
          .from(mediaItems)
          .innerJoin(
            authorMediaStatuses,
            and(
              eq(authorMediaStatuses.mediaItemId, mediaItems.id),
              eq(authorMediaStatuses.authorId, currentAuthorId),
              eq(authorMediaStatuses.status, "wanted"),
            ),
          )
          .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
          .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
          .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
          .where(accessCondition)
          .groupBy(
            mediaItems.id,
            mediaCarriers.code,
            mediaItemMetadata.facts,
            authorMediaStatuses.createdAt,
          )
          .orderBy(
            sql`${authorMediaStatuses.createdAt} desc`,
            sql`${mediaItems.id} desc`,
          )
          .limit(SECTION_SIZES.wanted)
      : Promise.resolve([]);
  const countRowsPromise = db
      .select({
        count: sql<number>`count(${mediaItems.id})::int`,
        mediaType: mediaItems.mediaType,
        mediaTypeName: mediaTypes.name,
      })
      .from(mediaItems)
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(accessCondition)
      .groupBy(mediaItems.mediaType, mediaTypes.name)
      .orderBy(sql`count(${mediaItems.id}) desc`, mediaTypes.name);

  return {
    about: countRowsPromise.then((counts) => ({
      counts,
      totalCount: counts.reduce((sum, item) => sum + item.count, 0),
    })),
    latestRatings: latestRatingsPromise.then(resolveMediaItems),
    newItems: newItemsPromise.then(resolveMediaItems),
    reviews: reviewsPromise.then(resolveMediaItems),
    top: topRowsPromise.then(resolveMediaItems),
    wanted: wantedPromise.then(resolveMediaItems),
  };
}

function createDailyDossierQuery(input: {
  currentAuthorId?: number;
  mediaItemId?: number;
  minAverageScore: number;
}) {
  const minAverageScore = parseDailyDossierMinAverageScore(input.minAverageScore);

  if (minAverageScore === null) {
    throw new Error("Invalid daily dossier minimum average score");
  }

  const averageScoreSql = sql<number | null>`avg(${ratings.score})::float`;

  return db
    .select({
      averageScore: averageScoreSql,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: input.currentAuthorId
        ? sql<number | null>`max(${ratings.score}) filter (where ${ratings.authorId} = ${input.currentAuthorId})::int`
        : sql<number | null>`null`,
      id: mediaItems.id,
      mediaCarrierCode: mediaCarriers.code,
      mediaType: mediaItems.mediaType,
      metadataFacts: mediaItemMetadata.facts,
      ratingsCount: sql<number>`count(distinct ${ratings.id})::int`,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(
      globalDailyDossierCondition,
      input.mediaItemId ? eq(mediaItems.id, input.mediaItemId) : undefined,
    ))
    .groupBy(mediaItems.id, mediaCarriers.code, mediaItemMetadata.facts)
    .having(
      minAverageScore > 0
        ? sql`${averageScoreSql} >= ${minAverageScore * 10}`
        : undefined,
    );
}

function resolveDailyDossierItem(item: MainPageMediaItem | undefined) {
  return item
    ? {
        ...item,
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
        coverUrl: resolveCoverUrl(item.coverUrl),
      }
    : null;
}

export async function getRandomDailyDossierCandidate(input: {
  currentAuthorId?: number;
  minAverageScore: number;
}) {
  const [item] = await createDailyDossierQuery(input)
    .orderBy(sql`random()`)
    .limit(1);

  return resolveDailyDossierItem(item);
}

export async function getEligibleDailyDossierById(
  input: {
    currentAuthorId?: number;
    id: number;
    minAverageScore: number;
  },
) {
  const [item] = await createDailyDossierQuery({
    currentAuthorId: input.currentAuthorId,
    mediaItemId: input.id,
    minAverageScore: input.minAverageScore,
  }).limit(1);

  return resolveDailyDossierItem(item);
}
