import { and, asc, eq, gt, isNull } from "drizzle-orm"

import { contributionReviews, jobRuns } from "@/db/schema"
import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots"
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types"
import { reviewBodyToPlainText } from "./body"

type Payload = { afterId: number; processed: number; updated: number }
export const REVIEW_BODY_LENGTH_JOB = "reviews.body-length-backfill"

export function parseReviewBodyLengthPayload(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false })
  }
  const source = value as Record<string, unknown>
  const keys = ["afterId", "processed", "updated"] as const
  if (Object.keys(source).some((key) => !keys.includes(key as typeof keys[number]))) {
    throw new JobError("invalid-payload", "Неизвестные параметры миграции.", { retryable: false })
  }
  const result: Payload = { afterId: 0, processed: 0, updated: 0 }
  for (const key of keys) {
    const number = source[key] ?? 0
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0 || number > 2147483647) {
      throw new JobError("invalid-payload", "Некорректный курсор или счётчик миграции.", { retryable: false })
    }
    result[key] = number
  }
  return result
}

export const reviewBodyLengthHandler: JobHandlerDefinition<Payload> = {
  type: REVIEW_BODY_LENGTH_JOB,
  label: "Заполнение длины текстов рецензий",
  schedulable: false,
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 120,
  parsePayload: parseReviewBodyLengthPayload,
  async execute({ runId, lockToken, signal }) {
    if (!lockToken) throw new JobError("lease-lost", "Запуск потерял право выполнения.", { retryable: false })
    const hasMore = await withSnapshotJobGuard({ runId, lockToken }, async (tx) => {
      const [run] = await tx.select({ payload: jobRuns.payload }).from(jobRuns).where(eq(jobRuns.id, runId))
      const state = parseReviewBodyLengthPayload(run.payload)
      const rows = await tx.select({
        id: contributionReviews.contributionId,
        body: contributionReviews.body,
        bodyFormat: contributionReviews.bodyFormat,
      }).from(contributionReviews)
        .where(and(gt(contributionReviews.contributionId, state.afterId), isNull(contributionReviews.bodyTextLength)))
        .orderBy(asc(contributionReviews.contributionId)).limit(101)
      const batch = rows.slice(0, 100)
      let updated = 0
      for (const row of batch) {
        signal.throwIfAborted()
        const result = await tx.update(contributionReviews)
          .set({ bodyTextLength: reviewBodyToPlainText(row.body, row.bodyFormat).length })
          .where(and(
            eq(contributionReviews.contributionId, row.id),
            eq(contributionReviews.body, row.body),
            eq(contributionReviews.bodyFormat, row.bodyFormat),
            isNull(contributionReviews.bodyTextLength),
          )).returning({ id: contributionReviews.contributionId })
        updated += result.length
      }
      signal.throwIfAborted()
      await tx.update(jobRuns).set({
        payload: {
          afterId: batch.at(-1)?.id ?? state.afterId,
          processed: state.processed + batch.length,
          updated: state.updated + updated,
        },
        updatedAt: new Date(),
      }).where(eq(jobRuns.id, runId))
      return rows.length > 100
    })
    if (hasMore) throw new JobError("review-body-length-continue", "Следующая партия рецензий.", { deferSeconds: 1 })
  },
}
