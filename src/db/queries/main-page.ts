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

const SECTION_SIZES = {
  top: 12,
  newItems: 12,
  reviews: 12,
  wanted: 12,
} as const;

export const MAIN_PAGE_RECENT_SECTION_SIZE = 12;

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
  title: string;
};

export type MainPageSectionKey = keyof typeof SECTION_SIZES;

const globalDailyDossierCondition = and(
  eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
  eq(mediaTypes.isPubliclyAvailable, true),
  eq(mediaTypes.isAvailableToGuests, true),
  eq(mediaTypes.enabledByDefault, true),
);

function takeSection(items: MainPageMediaItem[], offset: number, size: number) {
  if (items.length === 0) {
    return [];
  }

  const sectionSize = Math.min(size, items.length);

  return Array.from(
    { length: sectionSize },
    (_, index) => items[(offset + index) % items.length],
  );
}

export async function getMainPageData(input: {
  currentAuthorId?: number;
  enabledMediaTypeCodes: readonly string[];
}) {
  const { currentAuthorId, enabledMediaTypeCodes } = input;

  if (enabledMediaTypeCodes.length === 0) {
    return {
      counts: [],
      sections: { top: [], newItems: [], reviews: [], recent: [], wanted: [] },
      totalCount: 0,
    };
  }

  const totalSampleSize = Object.values(SECTION_SIZES).reduce((sum, size) => sum + size, 0);
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

  const createMediaItemsQuery = () => db
    .select(mediaItemSelection)
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(accessCondition)
    .groupBy(
      mediaItems.id,
      mediaCarriers.code,
      mediaItemMetadata.facts,
    );

  const [randomRows, topRows, newestRows, reviewRows, wantedRows, countRows] = await Promise.all([
    createMediaItemsQuery()
      .orderBy(sql`random()`)
      .limit(totalSampleSize),
    createMediaItemsQuery()
      .having(sql`count(${ratings.id}) > 0`)
      .orderBy(
        sql`${averageScoreSql} desc nulls last`,
        sql`${ratingsCountSql} desc`,
        sql`lower(${mediaItems.title}) asc`,
        sql`${mediaItems.id} asc`,
      )
      .limit(SECTION_SIZES.top),
    createMediaItemsQuery()
      .orderBy(
        sql`${mediaItems.createdAt} desc`,
        sql`${mediaItems.id} desc`,
      )
      .limit(SECTION_SIZES.newItems),
    db
      .select(mediaItemSelection)
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
      .limit(SECTION_SIZES.reviews),
    currentAuthorId
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
      : Promise.resolve([]),
    db
      .select({
        count: sql<number>`count(${mediaItems.id})::int`,
        mediaType: mediaItems.mediaType,
        mediaTypeName: mediaTypes.name,
      })
      .from(mediaItems)
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(accessCondition)
      .groupBy(mediaItems.mediaType, mediaTypes.name)
      .orderBy(sql`count(${mediaItems.id}) desc`, mediaTypes.name),
  ]);

  const resolveMediaItems = (rows: typeof randomRows) => rows.map((item) => ({
    ...item,
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
  const items = resolveMediaItems(randomRows);
  let offset = 0;
  const sections = {} as Record<MainPageSectionKey, MainPageMediaItem[]>;

  for (const [key, size] of Object.entries(SECTION_SIZES) as [MainPageSectionKey, number][]) {
    sections[key] = takeSection(items, offset, size);
    offset += size;
  }
  sections.top = resolveMediaItems(topRows);
  sections.newItems = resolveMediaItems(newestRows);
  sections.reviews = resolveMediaItems(reviewRows);
  sections.wanted = resolveMediaItems(wantedRows);

  return {
    counts: countRows,
    sections,
    totalCount: countRows.reduce((sum, item) => sum + item.count, 0),
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

export async function getRecentlyViewedMediaItems(input: {
  accessibleMediaTypeCodes: readonly string[];
  authorId: number;
  ids: readonly number[];
}) {
  if (input.ids.length === 0 || input.accessibleMediaTypeCodes.length === 0) return [];

  const rows = await db
    .select({
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: sql<number | null>`max(${ratings.score}) filter (where ${ratings.authorId} = ${input.authorId})::int`,
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
      inArray(mediaItems.id, [...input.ids].slice(0, 500)),
      inArray(mediaItems.mediaType, [...input.accessibleMediaTypeCodes]),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      eq(mediaTypes.isPubliclyAvailable, true),
    ))
    .groupBy(mediaItems.id, mediaCarriers.code, mediaItemMetadata.facts);
  const byId = new Map(rows.map((row) => [row.id, resolveDailyDossierItem(row)]));

  return input.ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
