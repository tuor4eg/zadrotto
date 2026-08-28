import { asc, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaItemRatingStats, mediaItems, ratings } from "@/db/schema";
import { createJobRun } from "@/db/queries/jobs";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
} from "@/lib/jobs/model";

export const mediaItemAverageScoreSql = sql<number | null>`
  (${mediaItemRatingStats.scoreSum})::double precision / ${mediaItemRatingStats.ratingsCount}
`;

export const mediaItemRatingsCountSql = sql<number>`
  coalesce(${mediaItemRatingStats.ratingsCount}, 0)::int
`;

export type RatingStatsMismatch = {
  actualRatingsCount: number;
  actualScoreSum: number;
  mediaItemId: number;
  projectedRatingsCount: number | null;
  projectedScoreSum: number | null;
  totalMismatchCount: number;
};

export async function auditMediaItemRatingStats(limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("Лимит аудита должен быть от 1 до 1000.");
  }

  const rows = await db.execute<RatingStatsMismatch>(sql`
    WITH actual AS (
      SELECT media_item_id, count(*)::int AS ratings_count, sum(score)::int AS score_sum
      FROM ratings
      GROUP BY media_item_id
    )
    SELECT
      coalesce(actual.media_item_id, projected.media_item_id)::int AS "mediaItemId",
      coalesce(actual.ratings_count, 0)::int AS "actualRatingsCount",
      coalesce(actual.score_sum, 0)::int AS "actualScoreSum",
      projected.ratings_count::int AS "projectedRatingsCount",
      projected.score_sum::int AS "projectedScoreSum",
      count(*) over()::int AS "totalMismatchCount"
    FROM actual
    FULL JOIN media_item_rating_stats projected USING (media_item_id)
    WHERE actual.ratings_count IS DISTINCT FROM projected.ratings_count
       OR actual.score_sum IS DISTINCT FROM projected.score_sum
    ORDER BY coalesce(actual.media_item_id, projected.media_item_id)
    LIMIT ${limit}
  `);
  return {
    items: rows.map((row) => ({
      actualRatingsCount: row.actualRatingsCount,
      actualScoreSum: row.actualScoreSum,
      mediaItemId: row.mediaItemId,
      projectedRatingsCount: row.projectedRatingsCount,
      projectedScoreSum: row.projectedScoreSum,
    })),
    mismatchCount: rows[0]?.totalMismatchCount ?? 0,
  };
}

export async function rebuildMediaItemRatingStats() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${ratings} IN SHARE ROW EXCLUSIVE MODE`);
    await tx.delete(mediaItemRatingStats);
    const rebuilt = await tx.execute<{ mediaItemId: number }>(sql`
      INSERT INTO media_item_rating_stats (media_item_id, ratings_count, score_sum)
      SELECT media_item_id, count(*)::int, sum(score)::int
      FROM ratings
      GROUP BY media_item_id
      RETURNING media_item_id AS "mediaItemId"
    `);
    return { rebuilt: rebuilt.length };
  });
}

export type RatingStatsReconciliationPayload = {
  afterMediaItemId?: number;
  batchSize?: number;
};

export async function reconcileMediaItemRatingStatsBatch(
  input: RatingStatsReconciliationPayload,
) {
  const batchSize = input.batchSize ?? 500;
  const result = await db.transaction(async (tx) => {
    const itemRows = await tx
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(input.afterMediaItemId ? gt(mediaItems.id, input.afterMediaItemId) : undefined)
      .orderBy(asc(mediaItems.id))
      .limit(batchSize);
    const mediaItemIds = itemRows.map((item) => item.id);
    if (mediaItemIds.length === 0) {
      return { corrected: 0, lastMediaItemId: undefined, processed: 0 };
    }

    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(73001, locked.media_item_id)
      FROM (VALUES ${sql.join(mediaItemIds.map((id) => sql`(${id}::integer)`), sql`, `)})
        AS locked(media_item_id)
      ORDER BY locked.media_item_id
    `);

    const mismatches = await tx.execute<{ mediaItemId: number }>(sql`
      WITH actual AS (
        SELECT media_item_id, count(*)::int AS ratings_count, sum(score)::int AS score_sum
        FROM ratings
        WHERE ${inArray(ratings.mediaItemId, mediaItemIds)}
        GROUP BY media_item_id
      ), projected AS (
        SELECT media_item_id, ratings_count, score_sum
        FROM media_item_rating_stats
        WHERE ${inArray(mediaItemRatingStats.mediaItemId, mediaItemIds)}
      )
      SELECT coalesce(actual.media_item_id, projected.media_item_id)::int AS "mediaItemId"
      FROM actual
      FULL JOIN projected USING (media_item_id)
      WHERE actual.ratings_count IS DISTINCT FROM projected.ratings_count
         OR actual.score_sum IS DISTINCT FROM projected.score_sum
    `);

    await tx.execute(sql`
      INSERT INTO media_item_rating_stats (media_item_id, ratings_count, score_sum)
      SELECT media_item_id, count(*)::int, sum(score)::int
      FROM ratings
      WHERE ${inArray(ratings.mediaItemId, mediaItemIds)}
      GROUP BY media_item_id
      ON CONFLICT (media_item_id) DO UPDATE SET
        ratings_count = EXCLUDED.ratings_count,
        score_sum = EXCLUDED.score_sum
    `);
    await tx.delete(mediaItemRatingStats).where(sql`
      ${inArray(mediaItemRatingStats.mediaItemId, mediaItemIds)}
      AND NOT EXISTS (
        SELECT 1 FROM ${ratings}
        WHERE ${ratings.mediaItemId} = ${mediaItemRatingStats.mediaItemId}
      )
    `);

    return {
      corrected: mismatches.length,
      lastMediaItemId: mediaItemIds.at(-1),
      processed: mediaItemIds.length,
    };
  });

  if (result.lastMediaItemId && result.processed === batchSize) {
    await createJobRun({
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      payload: {
        afterMediaItemId: result.lastMediaItemId,
        batchSize,
      },
      retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
      source: "event",
      timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
      type: "media.rating-stats-reconcile",
    });
  }

  return result;
}
