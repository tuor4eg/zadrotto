import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { automoderationChecks } from "@/db/schema";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { formatAutomoderationReviewMessage } from "./model";
import { autoApproveMediaItem, evaluateMediaAutomoderationCheck } from "./media-policy";

export async function processAutomoderationCheck(checkId: number) {
  const now = new Date();
  const [claimed] = await db.update(automoderationChecks).set({
    status: "running",
    updatedAt: now,
  }).where(and(
    eq(automoderationChecks.id, checkId),
    eq(automoderationChecks.status, "pending"),
  )).returning();
  if (!claimed) return;

  try {
    const result = await evaluateMediaAutomoderationCheck(checkId);
    if (!result) {
      await db.update(automoderationChecks).set({
        status: "stale",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(automoderationChecks.id, checkId));
      return;
    }
    if (result.stale) {
      const reasonCodes = ["record_changed_during_check"];
      await db.update(automoderationChecks).set({
        reasonCodes,
        status: "stale",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(automoderationChecks.id, checkId));
      await logSystemActivity({
        action: "media-auto-moderation.review-required",
        entityId: result.mediaItemId,
        entityType: "media-item",
        entityLabel: result.title,
        message: formatAutomoderationReviewMessage(reasonCodes),
        metadata: { checkId, reasonCodes },
        severity: "warning",
      });
      return;
    }

    await db.update(automoderationChecks).set({
      decision: result.decision,
      reasonCodes: result.reasonCodes,
      checkResults: result.details,
      completedAt: claimed.mode === "shadow" || result.decision === "NEEDS_REVIEW"
        ? new Date()
        : null,
      status: claimed.mode === "shadow" || result.decision === "NEEDS_REVIEW"
        ? "completed"
        : "running",
      updatedAt: new Date(),
    }).where(and(
      eq(automoderationChecks.id, checkId),
      eq(automoderationChecks.status, "running"),
    ));

    if (claimed.mode === "enforce" && result.decision === "AUTO_APPROVE") {
      const approved = await autoApproveMediaItem({
        checkId,
        mediaItemId: result.mediaItemId,
        expectedRevision: claimed.subjectRevision,
        expectedUpdatedAt: result.expectedUpdatedAt,
      });
      if (!approved) {
        const reasonCodes = ["record_changed_during_check"];
        await db.update(automoderationChecks).set({
          reasonCodes,
          status: "stale",
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(automoderationChecks.id, checkId));
        await logSystemActivity({
          action: "media-auto-moderation.review-required",
          entityId: result.mediaItemId,
          entityType: "media-item",
          entityLabel: result.title,
          message: formatAutomoderationReviewMessage(reasonCodes),
          metadata: { checkId, reasonCodes },
          severity: "warning",
        });
        return;
      }
      await logSystemActivity({
        action: "media-auto-moderation.approved",
        entityId: approved.id,
        entityType: "media-item",
        entityLabel: approved.title,
        message: "Запись одобрена автоматически.",
        metadata: { checkId, policyVersion: claimed.policyVersion },
      });
      return;
    }

    await logSystemActivity({
      action: "media-auto-moderation.review-required",
      entityId: result.mediaItemId,
      entityType: "media-item",
      entityLabel: result.title,
      message: claimed.mode === "shadow" && result.decision === "AUTO_APPROVE"
        ? "Теневая проверка пройдена: запись соответствует правилам автоодобрения."
        : formatAutomoderationReviewMessage(result.reasonCodes),
      metadata: {
        checkId,
        decision: result.decision,
        mode: claimed.mode,
        reasonCodes: result.reasonCodes,
      },
      severity: result.decision === "NEEDS_REVIEW" ? "warning" : "info",
    });
  } catch (error) {
    await db.update(automoderationChecks).set({
      decision: "NEEDS_REVIEW",
      reasonCodes: ["check_execution_failed"],
      checkResults: { errorName: error instanceof Error ? error.name : typeof error },
      completedAt: new Date(),
      status: "completed",
      updatedAt: new Date(),
    }).where(eq(automoderationChecks.id, checkId));
    await logSystemActivity({
      action: "media-auto-moderation.review-required",
      entityId: Number(claimed.subjectKey),
      entityType: "media-item",
      message: formatAutomoderationReviewMessage(["check_execution_failed"]),
      metadata: { checkId, reasonCodes: ["check_execution_failed"] },
      severity: "warning",
    });
  }
}
