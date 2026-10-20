import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { guardAutomoderationJob } from "@/db/queries/automoderation-recovery";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { MEDIA_AUTOMODERATION_POLICY_CODE, MEDIA_AUTOMODERATION_POLICY_VERSION } from "./model";
import { automoderationChecks } from "@/db/schema";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { formatAutomoderationReviewMessage } from "./model";
import { autoApproveMediaItem, evaluateMediaAutomoderationCheck } from "./media-policy";

export type AutomoderationContext = { jobGuard?: SnapshotJobGuard; signal?: AbortSignal };

async function updateActiveCheck<T>(
  checkId: number,
  context: AutomoderationContext,
  write: (tx: DbTransaction, check: typeof automoderationChecks.$inferSelect) => Promise<T>,
) {
  context.signal?.throwIfAborted();
  return db.transaction(async (tx) => {
    await guardAutomoderationJob(tx, checkId, context.jobGuard);
    const [check] = await tx.select().from(automoderationChecks).where(and(
      eq(automoderationChecks.id, checkId),
      inArray(automoderationChecks.status, ["pending", "running"]),
    )).limit(1).for("update");
    if (!check) return null;
    const result = await write(tx, check);
    context.signal?.throwIfAborted();
    await guardAutomoderationJob(tx, checkId, context.jobGuard);
    return result;
  });
}

async function logOutcome(input: Parameters<typeof logSystemActivity>[0]) {
  try {
    await logSystemActivity(input);
  } catch {
    // The outcome is committed: failure of its audit log must not rewrite it.
    console.error("automoderation: failed to log committed outcome");
  }
}

export async function processAutomoderationCheck(checkId: number, context: AutomoderationContext = {}) {
  const claimed = await updateActiveCheck(checkId, context, async (tx, check) => {
    // Only a fenced retry can resume a check left running by an earlier attempt.
    if (check.status === "running" && !context.jobGuard) return null;
    const [row] = await tx.update(automoderationChecks).set({ status: "running", updatedAt: new Date() })
      .where(eq(automoderationChecks.id, checkId)).returning();
    return row;
  });
  if (!claimed) return;

  let result: Awaited<ReturnType<typeof evaluateMediaAutomoderationCheck>>;
  try {
    if (claimed.policyVersion !== MEDIA_AUTOMODERATION_POLICY_VERSION
      || claimed.policyCode !== MEDIA_AUTOMODERATION_POLICY_CODE) {
      throw new Error("AUTOMODERATION_POLICY_CHANGED");
    }
    result = await evaluateMediaAutomoderationCheck(checkId, context.signal, context.jobGuard);
    context.signal?.throwIfAborted();
  } catch (error) {
    const failed = await updateActiveCheck(checkId, context, async (tx) => {
      await tx.update(automoderationChecks).set({
        decision: "NEEDS_REVIEW", reasonCodes: ["check_execution_failed"],
        checkResults: { errorName: error instanceof Error ? error.name : typeof error },
        completedAt: new Date(), status: "completed", updatedAt: new Date(),
      }).where(eq(automoderationChecks.id, checkId));
      return true;
    });
    if (failed) await logOutcome({
      action: "media-auto-moderation.review-required", entityId: Number(claimed.subjectKey),
      entityType: "media-item", message: formatAutomoderationReviewMessage(["check_execution_failed"]),
      metadata: { checkId, reasonCodes: ["check_execution_failed"] }, severity: "warning",
    });
    return;
  }

  if (!result || result.stale) {
    const reasonCodes = ["record_changed_during_check"];
    const stale = await updateActiveCheck(checkId, context, async (tx) => {
      await tx.update(automoderationChecks).set({
        reasonCodes, status: "stale", completedAt: new Date(), updatedAt: new Date(),
      }).where(eq(automoderationChecks.id, checkId));
      return true;
    });
    if (stale && result) await logOutcome({
      action: "media-auto-moderation.review-required", entityId: result.mediaItemId,
      entityType: "media-item", entityLabel: result.title,
      message: formatAutomoderationReviewMessage(reasonCodes), metadata: { checkId, reasonCodes }, severity: "warning",
    });
    return;
  }

  if (claimed.mode === "enforce" && result.decision === "AUTO_APPROVE") {
    const approved = await autoApproveMediaItem({
      checkId, mediaItemId: result.mediaItemId, expectedRevision: claimed.subjectRevision,
      expectedUpdatedAt: result.expectedUpdatedAt, jobGuard: context.jobGuard, signal: context.signal,
    });
    if (approved) {
      await logOutcome({
        action: "media-auto-moderation.approved", entityId: approved.id, entityType: "media-item",
        entityLabel: approved.title, message: "Запись одобрена автоматически.",
        metadata: { checkId, policyVersion: claimed.policyVersion },
      });
      return;
    }
    const reasonCodes = ["record_changed_during_check"];
    const stale = await updateActiveCheck(checkId, context, async (tx) => {
      await tx.update(automoderationChecks).set({
        reasonCodes, status: "stale", completedAt: new Date(), updatedAt: new Date(),
      }).where(eq(automoderationChecks.id, checkId));
      return true;
    });
    if (stale) await logOutcome({
      action: "media-auto-moderation.review-required", entityId: result.mediaItemId, entityType: "media-item",
      entityLabel: result.title, message: formatAutomoderationReviewMessage(reasonCodes),
      metadata: { checkId, reasonCodes }, severity: "warning",
    });
    return;
  }

  const completed = await updateActiveCheck(checkId, context, async (tx) => {
    await tx.update(automoderationChecks).set({
      decision: result.decision, reasonCodes: result.reasonCodes, checkResults: result.details,
      completedAt: new Date(), status: "completed", updatedAt: new Date(),
    }).where(eq(automoderationChecks.id, checkId));
    return true;
  });
  if (completed) await logOutcome({
    action: "media-auto-moderation.review-required", entityId: result.mediaItemId, entityType: "media-item",
    entityLabel: result.title,
    message: claimed.mode === "shadow" && result.decision === "AUTO_APPROVE"
      ? "Теневая проверка пройдена: запись соответствует правилам автоодобрения."
      : formatAutomoderationReviewMessage(result.reasonCodes),
    metadata: { checkId, decision: result.decision, mode: claimed.mode, reasonCodes: result.reasonCodes },
    severity: result.decision === "NEEDS_REVIEW" ? "warning" : "info",
  });
}
