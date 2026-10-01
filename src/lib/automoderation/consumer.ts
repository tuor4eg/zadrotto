import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  archiveSettings,
  automoderationChecks,
  franchises,
  jobRuns,
  mediaItemFranchises,
  mediaItemProviderSnapshots,
  mediaItems,
} from "@/db/schema";
import type { DomainEventConsumer } from "@/lib/domain-events/registry";
import {
  MEDIA_AUTOMODERATION_JOB_TYPE,
  MEDIA_AUTOMODERATION_POLICY_CODE,
  MEDIA_AUTOMODERATION_POLICY_VERSION,
  isAutomoderationMode,
} from "./model";

export const mediaAutomoderationConsumer: DomainEventConsumer = {
  key: "automoderation.media.create-check",
  eventTypes: ["media.submitted"],
  async handle(tx, event) {
    if (event.type !== "media.submitted") return;
    const payload = event.payload as {
      authorId: number;
      mediaItemId: number;
      moderationRevision: number;
    };
    const [settings] = await tx.select({ mode: archiveSettings.mediaAutoModerationMode })
      .from(archiveSettings)
      .where(eq(archiveSettings.id, 1))
      .limit(1);
    const mode = isAutomoderationMode(settings?.mode) ? settings.mode : "off";
    if (mode === "off") return;

    const [item] = await tx.select({
      description: mediaItems.description,
      mediaCarrierId: mediaItems.mediaCarrierId,
      mediaType: mediaItems.mediaType,
      moderationRevision: mediaItems.moderationRevision,
      originalTitle: mediaItems.originalTitle,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    }).from(mediaItems).where(and(
      eq(mediaItems.id, payload.mediaItemId),
      eq(mediaItems.publicationStatus, "submitted"),
      eq(mediaItems.moderationRevision, payload.moderationRevision),
    )).limit(1);
    if (!item) return;

    const [snapshot, franchiseRows] = await Promise.all([
      tx.select({ payloadHash: mediaItemProviderSnapshots.payloadHash })
        .from(mediaItemProviderSnapshots)
        .where(eq(mediaItemProviderSnapshots.mediaItemId, payload.mediaItemId))
        .limit(1),
      tx.select({ id: franchises.id, status: franchises.publicationStatus })
        .from(mediaItemFranchises)
        .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
        .where(eq(mediaItemFranchises.mediaItemId, payload.mediaItemId)),
    ]);
    const fingerprint = createHash("sha256").update(JSON.stringify({
      ...item,
      franchiseIds: franchiseRows.map((row) => row.id).sort((a, b) => a - b),
      providerSnapshotHash: snapshot[0]?.payloadHash ?? null,
    })).digest("hex");
    const now = new Date();
    const [check] = await tx.insert(automoderationChecks).values({
      sourceEventId: event.id,
      subjectType: "media-item",
      subjectKey: String(payload.mediaItemId),
      subjectRevision: payload.moderationRevision,
      policyCode: MEDIA_AUTOMODERATION_POLICY_CODE,
      policyVersion: MEDIA_AUTOMODERATION_POLICY_VERSION,
      mode,
      inputFingerprint: fingerprint,
    }).onConflictDoNothing().returning({ id: automoderationChecks.id });
    if (!check) return;

    await tx.insert(jobRuns).values({
      type: MEDIA_AUTOMODERATION_JOB_TYPE,
      payload: { checkId: check.id },
      source: "event",
      status: "queued",
      scheduledFor: now,
      availableAt: now,
      maxAttempts: 1,
      timeoutSeconds: 60,
      retryBaseSeconds: 60,
      retryMaxSeconds: 60,
    }).onConflictDoNothing();
  },
};
