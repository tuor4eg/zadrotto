import { and, asc, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { creatorRequests } from "@/db/schema";
import { createJobRun } from "./jobs";
import type { CreatorTransaction } from "./creators";

export const CREATOR_AUTO_APPROVAL_JOB = "media.creator-request-auto-approve";
export type CreatorAutoApprovalPayload = { scanPending: true } | { requestIds: number[] } | { afterId: number; upToId: number };

export async function getCreatorAutoApprovalUpperId(tx: CreatorTransaction) {
  const [row] = await tx.select({ id: creatorRequests.id }).from(creatorRequests).where(and(
    isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"),
    sql`exists (select 1 from creator_request_media_items o where o.request_id = ${creatorRequests.id})`,
  )).orderBy(desc(creatorRequests.id)).limit(1);
  return row?.id ?? null;
}

export async function enqueueCreatorAutoApproval(tx: CreatorTransaction, requestIds: readonly number[]) {
  const ids = [...new Set(requestIds)];
  for (let offset = 0; offset < ids.length; offset += 100) {
    await enqueueCreatorAutoApprovalRun(tx, { requestIds: ids.slice(offset, offset + 100) });
  }
}

export function enqueueCreatorAutoApprovalRun(tx: CreatorTransaction, payload: CreatorAutoApprovalPayload) {
  return createJobRun({ type: CREATOR_AUTO_APPROVAL_JOB, payload, source: "event",
    maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
}

export function getCreatorAutoApprovalBatch(afterId: number, upToId: number) {
  return db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(
    gt(creatorRequests.id, afterId), lte(creatorRequests.id, upToId),
    isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"),
    sql`exists (select 1 from creator_request_media_items o where o.request_id = ${creatorRequests.id})`,
  )).orderBy(asc(creatorRequests.id)).limit(100);
}
