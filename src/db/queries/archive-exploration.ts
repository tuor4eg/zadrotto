import "server-only";

import { and, asc, eq, exists, gte, lt, not, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorArchiveExplorationSettings,
  authorMediaStatuses,
  mediaItemRatingStats,
  mediaItems,
  mediaTypes,
  ratings,
} from "@/db/schema";
import {
  ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE,
  ARCHIVE_EXPLORATION_ONBOARDING_STEPS,
  ARCHIVE_EXPLORATION_RATING_LIMIT,
  type ArchiveExplorationCandidate,
  type ArchiveExplorationOnboardingStep,
} from "@/lib/archive-exploration/model";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";

export async function getArchiveExplorationRatingsCount(authorId: number) {
  const rows = await db
    .select({ id: ratings.id })
    .from(ratings)
    .where(eq(ratings.authorId, authorId))
    .limit(ARCHIVE_EXPLORATION_RATING_LIMIT);
  return rows.length;
}

export async function claimArchiveExplorationInvite(authorId: number) {
  const rows = await db.execute<{
    autoShowEnabled: boolean;
    onboardingStep: number;
  }>(sql`
    WITH eligible AS (
      SELECT ${authorId}::integer AS author_id
      WHERE (
        SELECT count(*) FROM (
          SELECT 1 FROM ${ratings}
          WHERE ${ratings.authorId} = ${authorId}
          LIMIT ${ARCHIVE_EXPLORATION_RATING_LIMIT}
        ) limited_ratings
      ) < ${ARCHIVE_EXPLORATION_RATING_LIMIT}
    )
    INSERT INTO ${authorArchiveExplorationSettings} (
      author_id, auto_show_enabled, last_auto_shown_at, created_at, updated_at
    )
    SELECT author_id, true, now(), now(), now() FROM eligible
    ON CONFLICT (author_id) DO UPDATE SET
      last_auto_shown_at = now(),
      updated_at = now()
    WHERE ${authorArchiveExplorationSettings.autoShowEnabled} = true
      AND ${authorArchiveExplorationSettings.onboardingStep} < ${ARCHIVE_EXPLORATION_ONBOARDING_STEPS.completed}
      AND (
        ${authorArchiveExplorationSettings.lastAutoShownAt} IS NULL
        OR ${authorArchiveExplorationSettings.lastAutoShownAt} <= now() - interval '24 hours'
      )
    RETURNING
      auto_show_enabled AS "autoShowEnabled",
      onboarding_step AS "onboardingStep"
  `);
  return {
    autoShowEnabled: rows[0]?.autoShowEnabled ?? true,
    onboardingStep:
      rows[0]?.onboardingStep ?? ARCHIVE_EXPLORATION_ONBOARDING_STEPS.invitation,
    shouldShow: rows.length > 0,
  };
}

export async function setArchiveExplorationAutoShow(authorId: number, enabled: boolean) {
  await db.insert(authorArchiveExplorationSettings).values({
    authorId,
    autoShowEnabled: enabled,
  }).onConflictDoUpdate({
    target: authorArchiveExplorationSettings.authorId,
    set: { autoShowEnabled: enabled, updatedAt: new Date() },
  });
}

export async function getArchiveExplorationOnboardingStep(authorId: number) {
  const [row] = await db
    .select({ onboardingStep: authorArchiveExplorationSettings.onboardingStep })
    .from(authorArchiveExplorationSettings)
    .where(eq(authorArchiveExplorationSettings.authorId, authorId))
    .limit(1);
  return row?.onboardingStep ?? ARCHIVE_EXPLORATION_ONBOARDING_STEPS.invitation;
}

export async function advanceArchiveExplorationOnboardingStep(
  authorId: number,
  onboardingStep: ArchiveExplorationOnboardingStep,
) {
  await db.execute(sql`
    INSERT INTO ${authorArchiveExplorationSettings} (
      author_id, onboarding_step, created_at, updated_at
    ) VALUES (${authorId}, ${onboardingStep}, now(), now())
    ON CONFLICT (author_id) DO UPDATE SET
      onboarding_step = greatest(
        ${authorArchiveExplorationSettings.onboardingStep},
        EXCLUDED.onboarding_step
      ),
      updated_at = now()
  `);
}

export async function getArchiveExplorationCandidate(
  authorId: number,
  orderedMediaTypeCodes: readonly string[],
): Promise<ArchiveExplorationCandidate | null> {
  if (orderedMediaTypeCodes.length === 0) return null;

  const baseCondition = (mediaTypeCode: string) => and(
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    eq(mediaTypes.isPubliclyAvailable, true),
    eq(mediaItems.mediaType, mediaTypeCode),
    sql`${mediaItemRatingStats.scoreSum} >= ${mediaItemRatingStats.ratingsCount} * ${ARCHIVE_EXPLORATION_MIN_AVERAGE_SCORE}`,
    not(exists(db.select({ id: ratings.id }).from(ratings).where(and(
      eq(ratings.authorId, authorId),
      eq(ratings.mediaItemId, mediaItems.id),
    )))),
    not(exists(db.select({ id: authorMediaStatuses.id }).from(authorMediaStatuses).where(and(
      eq(authorMediaStatuses.authorId, authorId),
      eq(authorMediaStatuses.mediaItemId, mediaItems.id),
    )))),
  );
  for (const mediaTypeCode of orderedMediaTypeCodes) {
    const condition = baseCondition(mediaTypeCode);
    const [{ maxId }] = await db
      .select({ maxId: sql<number | null>`max(${mediaItemRatingStats.mediaItemId})::int` })
      .from(mediaItemRatingStats)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemRatingStats.mediaItemId))
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(condition);
    if (!maxId) continue;
    const pivot = Math.floor(Math.random() * maxId) + 1;

    const selectCandidate = (rangeCondition: ReturnType<typeof gte> | ReturnType<typeof lt>) => db
      .select({
        averageScore: sql<number>`(${mediaItemRatingStats.scoreSum})::float / ${mediaItemRatingStats.ratingsCount}`,
        code: mediaItems.code,
        coverThumbUrl: mediaItems.coverThumbUrl,
        coverUrl: mediaItems.coverUrl,
        id: mediaItems.id,
        mediaType: mediaItems.mediaType,
        mediaTypeName: mediaTypes.name,
        ratingsCount: mediaItemRatingStats.ratingsCount,
        releaseYear: mediaItems.releaseYear,
        title: mediaItems.title,
      })
      .from(mediaItemRatingStats)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemRatingStats.mediaItemId))
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .where(and(condition, rangeCondition))
      .orderBy(asc(mediaItemRatingStats.mediaItemId))
      .limit(1);

    const [afterPivot] = await selectCandidate(gte(mediaItemRatingStats.mediaItemId, pivot));
    const candidate = afterPivot ?? (await selectCandidate(lt(mediaItemRatingStats.mediaItemId, pivot)))[0];
    if (candidate) {
      return {
        ...candidate,
        coverThumbUrl: resolveCoverUrl(candidate.coverThumbUrl),
        coverUrl: resolveCoverUrl(candidate.coverUrl),
      };
    }
  }

  return null;
}
