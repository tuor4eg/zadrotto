import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { achievements, authors } from "@/db/schema";
import { runInTransaction } from "@/db/transaction";
import { createJobRun } from "@/db/queries/jobs";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
} from "@/lib/jobs/model";
import { evaluateAchievements } from "./service";

export type AchievementBackfillPayload = {
  achievementIds?: number[];
  afterAuthorId?: number;
  awardGroupId?: string;
  batchSize?: number;
};

export async function backfillAchievements(input: AchievementBackfillPayload) {
  const batchSize = input.batchSize ?? 100;
  const awardGroupId = input.awardGroupId ?? randomUUID();
  const achievementIds = input.achievementIds ? [...new Set(input.achievementIds)] : undefined;
  if (achievementIds?.length) {
    const existing = await db.select({ id: achievements.id }).from(achievements)
      .where(inArray(achievements.id, achievementIds));
    if (existing.length !== achievementIds.length) {
      throw new Error("Backfill ссылается на несуществующую ачивку.");
    }
  }
  const authorRows = await db
    .select({ id: authors.id })
    .from(authors)
    .where(and(
      eq(authors.isSystem, false),
      isNull(authors.blockedAt),
      input.afterAuthorId ? gt(authors.id, input.afterAuthorId) : undefined,
    ))
    .orderBy(asc(authors.id))
    .limit(batchSize);
  const authorIds = authorRows.map((author) => author.id);

  const awards = authorIds.length > 0
    ? await runInTransaction((tx) => evaluateAchievements(tx, {
        achievementIds,
        authorIds,
        awardGroupId,
      }))
    : [];
  const lastAuthorId = authorIds.at(-1);

  if (lastAuthorId && authorRows.length === batchSize) {
    await createJobRun({
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      payload: {
        ...(achievementIds ? { achievementIds } : {}),
        afterAuthorId: lastAuthorId,
        awardGroupId,
        batchSize,
      },
      retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
      retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
      source: "event",
      timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
      type: "achievements.backfill",
    });
  }

  return {
    awardGroupId,
    awarded: awards.length,
    processed: authorRows.length,
  };
}
